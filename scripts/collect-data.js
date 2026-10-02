/**
 * GitHub Actions 数据采集脚本
 * 从 51.la API 获取数据并存储到 MongoDB
 *
 * 用法：node scripts/collect-data.js
 * 环境变量：
 *   ACCESS_KEY     - 51.la Access Key
 *   SECRET_KEY     - 51.la Secret Key
 *   SITES          - JSON 格式的站点列表
 *   MONGODB_URI    - MongoDB 连接字符串
 *   MONGODB_DB     - 数据库名（默认 website_statistics）
 *   MONGODB_COL    - 集合名（默认 51.la）
 *   MAX_RETRIES    - 最大重试次数（默认 3）
 */

const crypto = require('crypto');
const { MongoClient } = require('mongodb');

// ========== 配置 ==========
const config = {
  accessKey: process.env.ACCESS_KEY,
  secretKey: process.env.SECRET_KEY,
  apiUrl: 'https://v6-open.51.la/open/overview/get',
  sites: [],
  mongodbUri: process.env.MONGODB_URI,
  dbName: process.env.MONGODB_DB || 'website_statistics',
  collectionName: process.env.MONGODB_COL || '51.la',
  maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 3
};

// 解析站点列表
if (process.env.SITES) {
  try {
    config.sites = JSON.parse(process.env.SITES);
  } catch (e) {
    console.error('❌ SITES 环境变量解析失败:', e.message);
    process.exit(1);
  }
} else {
  // 默认站点
  config.sites = [
    { name: 'aqcoder.cn', maskId: 'KRFNvLFZwSFuA2NM' },
    { name: 'bimg.cc', maskId: 'K3XUEeVtpB9QftHf' }
  ];
}

// 校验必要配置
if (!config.accessKey || !config.secretKey) {
  console.error('❌ 缺少 ACCESS_KEY 或 SECRET_KEY 环境变量');
  process.exit(1);
}
if (!config.mongodbUri) {
  console.error('❌ 缺少 MONGODB_URI 环境变量');
  process.exit(1);
}

// ========== 工具函数 ==========

/**
 * 获取北京时间的日期字符串 YYYY-MM-DD
 * 51.la 的数据是按北京时间统计的，必须用北京时间存日期
 */
function getBeijingDateStr() {
  const now = new Date();
  // 北京时间 = UTC + 8 小时
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = beijingTime.getUTCFullYear();
  const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 延迟函数
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== 51.la API ==========
function generateNonce(length = 4) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateSign(nonce, timestamp) {
  const raw = `accessKey=${config.accessKey}&nonce=${nonce}&secretKey=${config.secretKey}&timestamp=${timestamp}`;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex').toUpperCase();
}

/**
 * 获取 51.la 概览数据（带重试）
 */
async function fetchOverview(maskId, retries = 0) {
  const timestamp = String(Date.now());
  const nonce = generateNonce(4);
  const sign = generateSign(nonce, timestamp);
  const payload = {
    maskId,
    accessKey: config.accessKey,
    nonce,
    timestamp,
    sign
  };

  try {
    const res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 GitHub Actions Collector'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const result = await res.json();
    const code = result.code;
    const success = code === '0000' || result.success === true;

    if (!success) {
      throw new Error(`API code=${code}, message=${result.message || '未知错误'}`);
    }

    return result;

  } catch (e) {
    if (retries < config.maxRetries - 1) {
      const waitSec = (retries + 1) * 2; // 2s, 4s, 6s 递增
      console.log(`  ⚠️  请求失败 (${retries + 1}/${config.maxRetries}): ${e.message}`);
      console.log(`  ⏳  ${waitSec} 秒后重试...`);
      await delay(waitSec * 1000);
      return fetchOverview(maskId, retries + 1);
    }
    console.error(`  ❌ 请求失败（已重试 ${config.maxRetries} 次）: ${e.message}`);
    return null;
  }
}

// ========== MongoDB 存储 ==========
let client = null;

async function connectMongo() {
  console.log('📡 连接 MongoDB...');
  client = new MongoClient(config.mongodbUri, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000
  });
  await client.connect();
  await client.db('admin').command({ ping: 1 });
  console.log('✅ MongoDB 连接成功');
}

async function upsertDaily(siteName, dateStr, data) {
  const db = client.db(config.dbName);
  const col = db.collection(config.collectionName);

  // 确保复合唯一索引
  await col.createIndex({ site: 1, date: 1 }, { unique: true });
  // 日期索引加速查询
  await col.createIndex({ date: -1 });

  const doc = {
    site: siteName,
    date: dateStr,
    updatedAt: new Date(),
    data: data
  };

  const result = await col.updateOne(
    { site: siteName, date: dateStr },
    { $set: doc },
    { upsert: true }
  );

  if (result.upsertedCount > 0) {
    console.log(`  📥 已插入新记录: ${dateStr} (UV: ${data.curUv ?? '--'}, PV: ${data.curPv ?? '--'})`);
  } else {
    console.log(`  🔄 已更新记录: ${dateStr} (UV: ${data.curUv ?? '--'}, PV: ${data.curPv ?? '--'})`);
  }
}

// ========== 主流程 ==========
async function main() {
  console.log('='.repeat(60));
  console.log('🚀 51.LA 数据采集任务（GitHub Actions）');
  console.log(`📍 站点数: ${config.sites.length}`);
  console.log(`🌐 北京时间: ${getBeijingDateStr()} ${new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log(`⏱️  UTC 时间: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  let successCount = 0;
  let failCount = 0;
  const failures = [];

  try {
    await connectMongo();
    const today = getBeijingDateStr();
    console.log(`\n📅 采集日期（北京时间）: ${today}`);

    for (let i = 0; i < config.sites.length; i++) {
      const site = config.sites[i];
      console.log(`\n─── [${i + 1}/${config.sites.length}] ${site.name} (${site.maskId}) ───`);

      const result = await fetchOverview(site.maskId);
      if (!result || !result.bean) {
        console.log(`  ❌ 数据获取失败`);
        failCount++;
        failures.push(site.name);
        continue;
      }

      await upsertDaily(site.name, today, result.bean);
      successCount++;
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ 任务完成：成功 ${successCount} 个，失败 ${failCount} 个`);
    if (failures.length > 0) {
      console.log(`❌ 失败站点: ${failures.join(', ')}`);
    }
    console.log('='.repeat(60));

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (e) {
    console.error('\n❌ 任务执行失败:', e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    if (client) {
      try {
        await client.close();
        console.log('📴 MongoDB 连接已关闭');
      } catch (e) {
        console.error('关闭 MongoDB 连接时出错:', e.message);
      }
    }
  }
}

main();
