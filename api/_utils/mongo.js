/**
 * 共享 MongoDB 连接工具
 * 所有 API 共用同一个 MongoClient 实例，避免重复连接
 */

const { MongoClient } = require('mongodb');
const config = require('./config');

const MONGODB_URI = config.mongodbUri;
const DB_NAME = config.mongodbDb;
const COL_NAME = config.mongodbCol;

let cachedClient = null;
let cachedDb = null;

/**
 * 获取 MongoDB 客户端和数据库实例
 * @returns {Promise<{ client: MongoClient, db: Db, collection: Collection }>}
 */
async function getMongo() {
  if (cachedClient && cachedDb) {
    return {
      client: cachedClient,
      db: cachedDb,
      collection: cachedDb.collection(COL_NAME)
    };
  }

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI 未配置');
  }

  cachedClient = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000
  });

  await cachedClient.connect();
  cachedDb = cachedClient.db(DB_NAME);

  // 确保复合唯一索引存在
  try {
    await cachedDb.collection(COL_NAME).createIndex(
      { site: 1, date: 1 },
      { unique: true }
    );
  } catch (e) {
    // 索引已存在则忽略
  }

  return {
    client: cachedClient,
    db: cachedDb,
    collection: cachedDb.collection(COL_NAME)
  };
}

/**
 * 构建日期范围查询条件
 * @param {object} opts - 查询选项
 * @param {string} [opts.site] - 站点名
 * @param {number} [opts.days] - 最近 N 天
 * @param {string} [opts.start] - 开始日期 YYYY-MM-DD
 * @param {string} [opts.end] - 结束日期 YYYY-MM-DD
 * @returns {object} MongoDB 查询条件
 */
function buildDateQuery(opts = {}) {
  const query = {};

  if (opts.site && opts.site !== 'all') {
    query.site = opts.site;
  }

  if (opts.start || opts.end) {
    query.date = {};
    if (opts.start) query.date.$gte = opts.start;
    if (opts.end) query.date.$lte = opts.end;
  } else if (opts.days && opts.days > 0) {
    const d = new Date();
    d.setDate(d.getDate() - opts.days + 1);
    query.date = { $gte: d.toISOString().split('T')[0] };
  }

  return query;
}

/**
 * 获取指定站点最近 N 天的数据（按日期升序）
 * @param {Collection} collection
 * @param {string} site - 站点名
 * @param {number} days - 天数
 * @returns {Promise<Array>}
 */
async function getSiteRecent(collection, site, days) {
  const records = await collection
    .find({ site })
    .sort({ date: -1 })
    .limit(days)
    .toArray();
  return records.reverse();
}

/**
 * 获取所有站点列表（去重）
 * @param {Collection} collection
 * @returns {Promise<string[]>}
 */
async function getAllSites(collection) {
  const sites = await collection.distinct('site');
  return sites.sort();
}

/**
 * 获取单站点最近 N 天的分析数据
 * @param {Collection} collection
 * @param {string} site - 站点名
 * @param {number} days - 天数
 * @param {Function} buildSiteData - 站点数据构建函数
 * @returns {Promise<object>} 站点分析数据
 */
async function fetchSiteData(collection, site, days, buildSiteData) {
  const records = await getSiteRecent(collection, site, days);
  return buildSiteData(site, records.map(r => ({ date: r.date, data: r.data })));
}

/**
 * 获取所有站点最近 N 天的分析数据
 * @param {Collection} collection
 * @param {number} days - 天数
 * @param {Function} buildSiteData - 站点数据构建函数
 * @returns {Promise<Array>} 站点分析数据数组
 */
async function fetchAllSitesData(collection, days, buildSiteData) {
  const allSites = await getAllSites(collection);
  const siteDataList = [];
  for (const siteName of allSites) {
    const siteData = await fetchSiteData(collection, siteName, days, buildSiteData);
    siteDataList.push(siteData);
  }
  return siteDataList;
}

module.exports = {
  getMongo,
  buildDateQuery,
  getSiteRecent,
  getAllSites,
  fetchSiteData,
  fetchAllSitesData,
  DB_NAME,
  COL_NAME
};
