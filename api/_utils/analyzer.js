/**
 * 数据分析器 - 从原始 51.la 数据计算统计和分析结果
 * 供前端 API 和导出接口共用
 */

// ========== 工具函数 ==========
function num(v, d = 0) {
  return typeof v === 'number' ? v : d;
}

function pct(v) {
  return Math.round(num(v) * 10000) / 100; // 0-100
}

function change(a, b) {
  if (!b || b === 0) return null;
  return Math.round(((a - b) / b) * 10000) / 100;
}

function avg(arr) {
  if (!arr.length) return 0;
  return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100;
}

function trendOf(series) {
  if (series.length < 2) return '平稳';
  const half = Math.floor(series.length / 2);
  const firstAvg = avg(series.slice(0, half));
  const secondAvg = avg(series.slice(half));
  if (firstAvg === 0) return '平稳';
  const diff = ((secondAvg - firstAvg) / firstAvg) * 100;
  if (diff > 5) return '上升';
  if (diff < -5) return '下降';
  return '平稳';
}

// ========== 质量评级 ==========
function levelByBounce(value) {
  if (value <= 30) return '优秀';
  if (value <= 50) return '良好';
  if (value <= 70) return '一般';
  return '偏高';
}

function levelByDuration(value) {
  if (value >= 180) return '优秀';
  if (value >= 60) return '良好';
  if (value >= 30) return '一般';
  return '偏短';
}

function levelByPvPerUv(value) {
  if (value >= 3) return '优秀';
  if (value >= 1.5) return '良好';
  return '一般';
}

function overallGrade(bounceLevel, durationLevel, pvPerUv) {
  const scoreMap = { '优秀': 3, '良好': 2, '一般': 1, '偏高': 0, '偏短': 0, '未知': 1 };
  const brScore = scoreMap[bounceLevel] ?? 1;
  const durScore = scoreMap[durationLevel] ?? 1;
  const pvScore = pvPerUv >= 3 ? 3 : pvPerUv >= 1.5 ? 2 : 1;
  const total = brScore + durScore + pvScore;
  if (total >= 7) return '优秀';
  if (total >= 5) return '良好';
  if (total >= 3) return '一般';
  return '待优化';
}

// ========== 单站点数据构建 ==========
/**
 * 从原始记录构建站点分析数据
 * 使用 before* 字段（昨日完整数据）进行渲染
 * 每条记录的 before* = 该采集日的前一天完整数据
 * 所以最新记录的 before* = 昨天数据，第二条记录的 before* = 前天数据
 * @param {string} siteName - 站点名
 * @param {Array} records - 原始记录数组（按日期升序），每项: { date, data }
 * @returns {object} 站点分析数据
 */
function buildSiteData(siteName, records) {
  if (!records || records.length === 0) {
    return {
      name: siteName,
      today: null,
      todayDate: '',
      yesterday: null,
      compareDate: '',
      compare: null,
      cumulative: null,
      quality: null,
      trend: null,
      history: [],
      overallGrade: '未知'
    };
  }

  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const n = sorted.length;

  // 最新记录的 before* = 昨天完整数据（主展示）
  // 上一条记录的 before* = 前天数据（对比基准）
  const todayRec = sorted[n - 1];
  const yesterdayRec = n >= 2 ? sorted[n - 2] : todayRec;

  // 日期从 beforeTime 字段解析
  const todayDate = parseBeforeTime(todayRec.data);
  const compareDate = parseBeforeTime(yesterdayRec.data);

  // 今日数据（用 before* 字段）
  const today = buildDayStats(todayRec.data);
  const yesterday = buildDayStats(yesterdayRec.data);

  // 环比变化
  const compare = {
    uvChange: change(today.uv, yesterday.uv),
    pvChange: change(today.pv, yesterday.pv),
    svChange: change(today.sv, yesterday.sv),
    ipChange: change(today.ip, yesterday.ip),
    newUserChange: change(today.newUser, yesterday.newUser)
  };

  // 累计数据（取最新记录的累计值）
  const latest = todayRec.data;
  const cumulative = {
    monthUv: num(latest.monthUv),
    monthPv: num(latest.monthPv),
    monthSv: num(latest.monthSv),
    monthIp: num(latest.monthIp),
    monthNewUserCount: num(latest.monthNewUserCount),
    monthBounceRate: pct(latest.monthBounceRate),
    monthAvgDuration: Math.round(num(latest.monthAvgDuration) / 1000),
    totalUv: num(latest.totalUv),
    totalPv: num(latest.totalPv),
    totalSv: num(latest.totalSv),
    totalIp: num(latest.totalIp),
    totalNewUserCount: num(latest.totalNewUserCount),
    totalBounceRate: pct(latest.totalBounceRate),
    totalAvgDuration: Math.round(num(latest.totalAvgDuration) / 1000),
    topUv: num(latest.topUv),
    topPv: num(latest.topPv),
    topSv: num(latest.topSv),
    topIp: num(latest.topIp),
    topUvDate: latest.topTimeUv || '',
    topPvDate: latest.topTimePv || '',
    topSvDate: latest.topTimeSv || '',
    topIpDate: latest.topTimeIp || ''
  };

  // 质量指标
  const quality = {
    bounceRate: {
      value: today.bounceRate,
      level: levelByBounce(today.bounceRate),
      change: change(today.bounceRate, yesterday.bounceRate)
    },
    avgDuration: {
      value: today.avgDuration,
      level: levelByDuration(today.avgDuration),
      change: change(today.avgDuration, yesterday.avgDuration)
    },
    pvPerUv: {
      value: today.pvPerUv,
      level: levelByPvPerUv(today.pvPerUv)
    }
  };

  // 趋势分析（基于所有记录的 before* 数据，都是完整的）
  const uvHistory = sorted.map(r => num(r.data.beforeUv));
  const pvHistory = sorted.map(r => num(r.data.beforePv));
  const svHistory = sorted.map(r => num(r.data.beforeSv));
  const avgU = avg(uvHistory);
  const avgP = avg(pvHistory);

  const trend = {
    uvTrend: trendOf(uvHistory),
    pvTrend: trendOf(pvHistory),
    svTrend: trendOf(svHistory),
    avgUv: avgU,
    avgPv: avgP,
    todayUvVsAvg: change(today.uv, avgU),
    todayPvVsAvg: change(today.pv, avgP),
    daysAnalyzed: n
  };

  // 历史数据（所有记录的 before* 数据）
  const history = sorted.map(r => {
    const stats = buildDayStats(r.data);
    stats.date = parseBeforeTime(r.data) || r.date;
    return stats;
  });

  return {
    name: siteName,
    today,
    todayDate,
    yesterday,
    compareDate,
    compare,
    cumulative,
    quality,
    trend,
    history,
    overallGrade: overallGrade(
      quality.bounceRate.level,
      quality.avgDuration.level,
      quality.pvPerUv.value
    )
  };
}

/**
 * 从单天原始数据构建设计化的日数据（使用 before* 字段）
 */
function buildDayStats(data, date) {
  const uv = num(data.beforeUv);
  const pv = num(data.beforePv);
  const result = {
    uv,
    pv,
    sv: num(data.beforeSv),
    ip: num(data.beforeIp),
    newUser: num(data.beforeNewUserCount),
    bounceRate: pct(data.beforeBounceRate),
    avgDuration: Math.round(num(data.beforeAvgDuration) / 1000),
    pvPerUv: uv > 0 ? Math.round((pv / uv) * 100) / 100 : 0
  };
  if (date) result.date = date;
  return result;
}

/**
 * 从 beforeTime 字段解析日期
 * 格式: "2021/07/01-2021/07/01" → "2021-07-01"
 */
function parseBeforeTime(data) {
  const bt = data && data.beforeTime;
  if (!bt) return '';
  const first = String(bt).split('-')[0];
  return first.replace(/\//g, '-');
}

// ========== 汇总/总览数据 ==========
/**
 * 构建多站点总览数据
 * @param {Array} siteDataList - 站点分析数据数组
 * @param {number} days - 统计天数
 * @returns {object}
 */
function buildOverviewData(siteDataList, days) {
  const validSites = siteDataList.filter(s => s.today);

  let totalUv = 0, totalPv = 0, totalSv = 0, totalIp = 0, totalNew = 0;
  let sumBounce = 0, sumDuration = 0, sumPvpu = 0;

  for (const s of validSites) {
    totalUv += s.today.uv;
    totalPv += s.today.pv;
    totalSv += s.today.sv;
    totalIp += s.today.ip;
    totalNew += s.today.newUser;
    sumBounce += s.today.bounceRate;
    sumDuration += s.today.avgDuration;
    sumPvpu += s.today.pvPerUv;
  }

  const avgBounce = validSites.length > 0 ? sumBounce / validSites.length : 0;
  const avgDuration = validSites.length > 0 ? sumDuration / validSites.length : 0;
  const avgPvpu = validSites.length > 0 ? sumPvpu / validSites.length : 0;

  // 最佳和最弱站点（按 UV）
  let bestSite = validSites[0];
  let weakestSite = validSites[0];
  for (const s of validSites) {
    if (s.today.uv > bestSite.today.uv) bestSite = s;
    if (s.today.uv < weakestSite.today.uv) weakestSite = s;
  }

  return {
    totalSites: siteDataList.length,
    totalUv,
    totalPv,
    totalSv,
    totalIp,
    totalNew,
    avgBounceRate: Math.round(avgBounce * 10) / 10,
    avgDuration: Math.round(avgDuration),
    avgPvPerUv: Math.round(avgPvpu * 100) / 100,
    reportDays: days,
    bestSite: bestSite?.name || '',
    bestGrade: bestSite?.overallGrade || '',
    weakestSite: weakestSite?.name || '',
    weakestGrade: weakestSite?.overallGrade || ''
  };
}

// ========== AI 报告生成（基于模板规则，非真正 AI） ==========
/**
 * 生成单站点 AI 分析报告（基于规则的模拟 AI 分析）
 * @param {object} siteData - 站点分析数据
 * @returns {object} AI 报告
 */
function generateSiteAIReport(siteData) {
  const { today, compare, quality, trend, cumulative, compareDate } = siteData;
  if (!today) return null;

  const compareLabel = formatCompareLabel(compareDate);
  const keyFindings = [];
  const recommendations = [];

  // 关键发现
  if (trend.uvTrend === '上升') {
    keyFindings.push({ icon: '📈', text: `UV 呈上升趋势，日均 UV ${trend.avgUv.toFixed(0)}，今日高于均值 ${trend.todayUvVsAvg?.toFixed(1) || 0}%` });
  } else if (trend.uvTrend === '下降') {
    keyFindings.push({ icon: '📉', text: `UV 呈下降趋势，日均 UV ${trend.avgUv.toFixed(0)}，今日低于均值 ${Math.abs(trend.todayUvVsAvg || 0).toFixed(1)}%` });
  } else {
    keyFindings.push({ icon: '➡️', text: `UV 走势平稳，日均 ${trend.avgUv.toFixed(0)}，流量表现稳定` });
  }

  keyFindings.push({ icon: '🎯', text: `跳出率 ${today.bounceRate.toFixed(1)}%，评级：${quality.bounceRate.level}` });
  keyFindings.push({ icon: '⏱️', text: `平均访问时长 ${today.avgDuration}秒，评级：${quality.avgDuration.level}` });
  keyFindings.push({ icon: '📄', text: `人均浏览 ${today.pvPerUv.toFixed(2)} 页，评级：${quality.pvPerUv.level}` });

  // 优化建议
  // 跳出率建议
  const bounceLevel = quality.bounceRate.level;
  if (bounceLevel === '偏高') {
    recommendations.push({
      type: 'warning',
      title: '降低跳出率',
      detail: '当前跳出率偏高，用户流失严重。建议优化落地页加载速度、提升首屏内容质量和相关性、增加内链引导和相关推荐模块。',
      priority: 'high'
    });
  } else if (bounceLevel === '一般') {
    recommendations.push({
      type: 'info',
      title: '优化跳出率',
      detail: '跳出率处于一般水平，仍有优化空间。建议从页面加载速度、内容相关性、内链布局三方面入手，逐步降低跳出率。',
      priority: 'medium'
    });
  } else if (bounceLevel === '良好') {
    recommendations.push({
      type: 'info',
      title: '保持跳出率优势',
      detail: '跳出率处于良好水平，用户留存能力不错。建议在此基础上优化高跳出页面，向优秀水平迈进。',
      priority: 'low'
    });
  } else if (bounceLevel === '优秀') {
    recommendations.push({
      type: 'success',
      title: '跳出率表现优秀',
      detail: '用户留存能力强，跳出率处于优秀水平，可继续保持内容质量并加大推广力度，扩大流量规模。',
      priority: 'low'
    });
  }

  // 访问时长建议
  const durationLevel = quality.avgDuration.level;
  if (durationLevel === '偏短') {
    recommendations.push({
      type: 'warning',
      title: '提升访问时长',
      detail: '用户停留时间偏短，内容吸引力不足。建议增加相关推荐、优化内容结构、提升页面互动性和视觉吸引力。',
      priority: 'high'
    });
  } else if (durationLevel === '一般') {
    recommendations.push({
      type: 'info',
      title: '延长用户停留时间',
      detail: '平均访问时长处于一般水平，建议丰富内容形式、增加互动元素、优化长文阅读体验，逐步提升用户粘性。',
      priority: 'medium'
    });
  } else if (durationLevel === '良好') {
    recommendations.push({
      type: 'info',
      title: '深化用户参与度',
      detail: '访问时长处于良好水平，用户愿意花时间阅读内容。建议增加评论、收藏、分享等互动功能，进一步提升参与感。',
      priority: 'low'
    });
  } else if (durationLevel === '优秀') {
    recommendations.push({
      type: 'success',
      title: '用户深度参与',
      detail: '平均访问时长优秀，用户粘性极强，适合布局会员订阅、付费内容、社区互动等高价值转化路径。',
      priority: 'low'
    });
  }

  // 人均页数建议
  const pvPerUvLevel = quality.pvPerUv.level;
  if (pvPerUvLevel === '一般') {
    recommendations.push({
      type: 'info',
      title: '增加浏览深度',
      detail: '人均浏览页数偏低，用户浏览深度不足。建议优化内链结构、增加相关文章推荐、优化导航和分类体验。',
      priority: 'medium'
    });
  } else if (pvPerUvLevel === '良好') {
    recommendations.push({
      type: 'info',
      title: '提升内容发现效率',
      detail: '人均浏览页数处于良好水平，用户愿意探索更多内容。建议优化推荐算法、增加专题合集，进一步提升浏览深度。',
      priority: 'low'
    });
  } else if (pvPerUvLevel === '优秀') {
    recommendations.push({
      type: 'success',
      title: '内容探索意愿强',
      detail: '人均浏览页数优秀，用户对内容认可度高，主动探索意愿强。可考虑构建内容矩阵、增加专栏体系。',
      priority: 'low'
    });
  }

  // UV 变化建议
  if (compare.uvChange !== null) {
    if (compare.uvChange > 20) {
      recommendations.push({
        type: 'info',
        title: '流量大幅增长',
        detail: `今日 UV ${compareLabel}增长 ${compare.uvChange.toFixed(1)}%，请关注增长来源并分析是否有推广活动或异常流量，把握增长机会。`,
        priority: 'medium'
      });
    } else if (compare.uvChange > 5) {
      recommendations.push({
        type: 'info',
        title: '流量稳步增长',
        detail: `今日 UV ${compareLabel}增长 ${compare.uvChange.toFixed(1)}%，呈稳步上升态势，建议持续观察增长趋势并复盘增长原因。`,
        priority: 'low'
      });
    } else if (compare.uvChange < -20) {
      recommendations.push({
        type: 'alert',
        title: '流量大幅下降',
        detail: `今日 UV ${compareLabel}下降 ${Math.abs(compare.uvChange).toFixed(1)}%，建议检查服务器状态、推广渠道和搜索引擎排名，及时排查原因。`,
        priority: 'high'
      });
    } else if (compare.uvChange < -5) {
      recommendations.push({
        type: 'warning',
        title: '流量有所下滑',
        detail: `今日 UV ${compareLabel}下降 ${Math.abs(compare.uvChange).toFixed(1)}%，需关注流量变化趋势，排查是否有内容更新或渠道波动因素。`,
        priority: 'medium'
      });
    }
  }

  // 深度分析
  const deepAnalysis = {
    trafficPattern: generateTrafficPatternAnalysis(trend, today),
    userBehavior: generateUserBehaviorAnalysis(quality, today),
    growthDrivers: generateGrowthDriversAnalysis(trend, cumulative),
    riskPoints: generateRiskPoints(quality, trend, compare),
    actionPlan: generateActionPlan(quality, trend)
  };

  // 趋势展望
  const trendOutlook = generateTrendOutlook(trend, cumulative);

  return {
    summary: generateAISummary(siteData),
    keyFindings,
    recommendations,
    deepAnalysis,
    trendOutlook
  };
}

function generateAISummary(siteData) {
  const { name, today, compare, overallGrade, trend, compareDate } = siteData;
  const compareLabel = formatCompareLabel(compareDate);
  const parts = [];
  parts.push(`${name} 今日 UV ${today.uv.toLocaleString()}，PV ${today.pv.toLocaleString()}`);
  if (compare.uvChange !== null) {
    parts.push(`${compareLabel}${compare.uvChange >= 0 ? '增长' : '下降'} ${Math.abs(compare.uvChange).toFixed(1)}%`);
  }
  parts.push(`综合质量评级为「${overallGrade}」`);
  parts.push(`近期趋势${trend.uvTrend === '上升' ? '向好' : trend.uvTrend === '下降' ? '承压' : '平稳'}`);
  return parts.join('，') + '。';
}

/**
 * 格式化对比日期标签（YYYY-MM-DD → 较M月D日）
 */
function formatCompareLabel(dateStr) {
  if (!dateStr) return '较昨日';
  const parts = dateStr.split('-');
  if (parts.length < 3) return '较昨日';
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  return `较${month}月${day}日`;
}

function generateTrafficPatternAnalysis(trend, today) {
  const parts = [];
  parts.push(`近期 UV 趋势整体呈「${trend.uvTrend}」态势，日均 UV 约 ${trend.avgUv.toFixed(0)}。`);
  if (trend.todayUvVsAvg !== null) {
    if (trend.todayUvVsAvg > 0) {
      parts.push(`今日 UV 高于近 ${trend.daysAnalyzed} 天均值 ${trend.todayUvVsAvg.toFixed(1)}%，表现优于平均水平。`);
    } else {
      parts.push(`今日 UV 低于近 ${trend.daysAnalyzed} 天均值 ${Math.abs(trend.todayUvVsAvg).toFixed(1)}%，需关注流量下滑原因。`);
    }
  }
  parts.push(`PV 趋势同样呈「${trend.pvTrend}」，与 UV 趋势${trend.uvTrend === trend.pvTrend ? '基本一致' : '存在分化'}，说明${trend.uvTrend === trend.pvTrend ? '流量变化主要由访客数驱动' : '用户浏览行为也在发生变化'}。`);
  return parts.join('');
}

function generateUserBehaviorAnalysis(quality, today) {
  const parts = [];
  parts.push(`用户跳出率为 ${today.bounceRate.toFixed(1)}%，处于「${quality.bounceRate.level}」水平。`);
  parts.push(`平均访问时长 ${today.avgDuration} 秒，评级「${quality.avgDuration.level}」。`);
  parts.push(`人均浏览页数 ${today.pvPerUv.toFixed(2)} 页，评级「${quality.pvPerUv.level}」。`);
  if (today.bounceRate > 70 && today.avgDuration < 30) {
    parts.push('用户粘性较弱，建议从内容质量和页面体验两方面入手优化。');
  } else if (today.bounceRate < 40 && today.avgDuration > 60) {
    parts.push('用户参与度较高，内容和体验均获得用户认可，可考虑增加转化路径。');
  }
  return parts.join('');
}

function generateGrowthDriversAnalysis(trend, cumulative) {
  const parts = [];
  if (trend.uvTrend === '上升') {
    parts.push('流量增长势头良好，增长可能来源于内容积累效应、SEO 优化见效或推广活动。');
    parts.push(`历史最高 UV 为 ${cumulative.topUv.toLocaleString()}（${cumulative.topUvDate}），建议复盘当时的增长经验。`);
  } else if (trend.uvTrend === '下降') {
    parts.push('流量面临下滑压力，需排查是否有内容更新频率下降、搜索引擎排名波动或竞品分流等因素。');
    parts.push(`历史最高 UV 为 ${cumulative.topUv.toLocaleString()}（${cumulative.topUvDate}），当前与峰值有较大差距，有回升空间。`);
  } else {
    parts.push('流量处于平稳期，增长进入瓶颈，需寻找新的增长突破口。');
    parts.push(`累计 UV 已达 ${cumulative.totalUv.toLocaleString()}，具备一定的用户基础。`);
  }
  return parts.join('');
}

function generateRiskPoints(quality, trend, compare) {
  const risks = [];
  if (quality.bounceRate.level === '偏高') risks.push('跳出率偏高，用户留存能力不足');
  if (quality.avgDuration.level === '偏短') risks.push('访问时长偏短，内容吸引力有待提升');
  if (trend.uvTrend === '下降') risks.push('UV 趋势下降，需警惕持续下滑风险');
  if (compare.uvChange !== null && compare.uvChange < -30) risks.push('今日流量骤降，建议紧急排查原因');
  if (risks.length === 0) risks.push('暂无明显风险点，继续保持当前运营策略');
  return risks;
}

function generateActionPlan(quality, trend) {
  const plan = [];

  // 短期（1-2周）
  const shortTerm = [];
  if (quality.bounceRate.level === '偏高') shortTerm.push('优化首页和落地页加载速度');
  if (quality.avgDuration.level === '偏短') shortTerm.push('增加热门文章和相关推荐模块');
  if (trend.uvTrend === '下降') shortTerm.push('排查流量下降原因，检查 SEO 和渠道数据');
  if (shortTerm.length === 0) shortTerm.push('维持现有内容更新频率，监控数据变化');
  plan.push(shortTerm.join('、'));

  // 中期（1-2月）
  const midTerm = [];
  midTerm.push('优化内链结构，提升用户浏览深度');
  midTerm.push('分析高流量页面特征，复制成功经验');
  if (quality.avgDuration.level !== '优秀') midTerm.push('丰富内容形式，增加互动元素');
  plan.push(midTerm.join('、'));

  // 长期（3-6月）
  const longTerm = [];
  longTerm.push('建立系统化的内容运营体系');
  longTerm.push('拓展流量渠道，降低单一渠道依赖');
  longTerm.push('布局用户增长和转化漏斗优化');
  plan.push(longTerm.join('、'));

  return plan;
}

function generateTrendOutlook(trend, cumulative) {
  const parts = [];
  if (trend.uvTrend === '上升') {
    parts.push('未来一段时间流量有望继续保持增长态势，');
    parts.push('建议乘胜追击，加大内容产出和推广投入，');
    parts.push(`向历史最高 UV ${cumulative.topUv.toLocaleString()} 发起冲击。`);
  } else if (trend.uvTrend === '下降') {
    parts.push('短期内流量可能继续承压，');
    parts.push('需尽快找到下滑原因并采取针对性措施，');
    parts.push('预计需要 2-4 周的调整期才能企稳回升。');
  } else {
    parts.push('流量将维持在当前水平附近波动，');
    parts.push('若无新的增长动力介入，短期内难有大幅突破，');
    parts.push('建议积极布局新的流量增长点。');
  }
  return parts.join('');
}

/**
 * 生成总览 AI 分析（多站点对比）
 * @param {Array} siteDataList - 站点分析数据数组
 * @param {object} overview - 总览数据
 * @returns {object}
 */
function generateOverviewAI(siteDataList, overview) {
  const valid = siteDataList.filter(s => s.today);
  if (valid.length < 2) return null;

  // 按 UV 排序
  const sorted = [...valid].sort((a, b) => b.today.uv - a.today.uv);
  const topSite = sorted[0];
  const bottomSite = sorted[sorted.length - 1];

  const uvGap = topSite.today.uv > 0
    ? ((topSite.today.uv - bottomSite.today.uv) / topSite.today.uv * 100).toFixed(1)
    : 0;

  const executiveSummary = `共 ${valid.length} 个站点，今日总 UV ${overview.totalUv.toLocaleString()}，总 PV ${overview.totalPv.toLocaleString()}。${topSite.name} 表现最佳（UV ${topSite.today.uv.toLocaleString()}），${bottomSite.name} 相对薄弱（UV ${bottomSite.today.uv.toLocaleString()}），站点间 UV 差距约 ${uvGap}%。整体质量评级以${[...new Set(valid.map(s => s.overallGrade))].join('、')}为主。`;

  const crossSiteComparison = {
    uvGap: `${topSite.name} 领先 ${bottomSite.name} 约 ${uvGap}%，${topSite.today.uv.toLocaleString()} vs ${bottomSite.today.uv.toLocaleString()}`,
    pvGap: `PV 差距同样明显，${topSite.name} 为 ${topSite.today.pv.toLocaleString()}，${bottomSite.name} 为 ${bottomSite.today.pv.toLocaleString()}`,
    qualityGap: `质量方面，${topSite.name} 评级「${topSite.overallGrade}」，${bottomSite.name} 评级「${bottomSite.overallGrade}」`,
    conclusion: generateComparisonConclusion(sorted)
  };

  const strategicRecommendations = sorted.map((site, idx) => ({
    target: site.name,
    strategy: idx === 0 ? '标杆巩固' : idx === sorted.length - 1 ? '重点突破' : '稳步提升',
    focus: idx === 0
      ? '保持领先优势，探索新增长模式'
      : idx === sorted.length - 1
      ? '快速补齐短板，缩小与头部差距'
      : '稳扎稳打，逐步提升各项指标',
    actions: generateStrategyActions(site, idx, sorted.length)
  }));

  return {
    executiveSummary,
    crossSiteComparison,
    strategicRecommendations
  };
}

function generateComparisonConclusion(sorted) {
  const parts = [];
  parts.push(`头部站点 ${sorted[0].name} 在流量规模上占据明显优势，`);
  const midSites = sorted.slice(1, -1);
  if (midSites.length > 0) {
    parts.push(`中部站点（${midSites.map(s => s.name).join('、')}）处于追赶态势，`);
  }
  parts.push(`尾部站点 ${sorted[sorted.length - 1].name} 亟需突破流量瓶颈。`);
  parts.push('各站点在质量指标上也存在差异，建议针对性优化。');
  return parts.join('');
}

function generateStrategyActions(site, index, total) {
  const actions = [];
  if (index === 0) {
    actions.push('持续输出高质量内容，巩固流量基本盘');
    actions.push('探索新的流量渠道和增长方式');
    actions.push('优化转化路径，提升流量价值');
  } else if (index === total - 1) {
    actions.push('分析头部站点成功经验，快速复制可行策略');
    actions.push('加大内容产出频率，积累长尾流量');
    actions.push('重点优化 SEO 基础，提升搜索引擎排名');
  } else {
    actions.push('保持稳定的内容更新节奏');
    actions.push('针对薄弱指标进行专项优化');
    actions.push('寻找差异化竞争优势，打造特色内容');
  }
  return actions;
}

module.exports = {
  // 工具函数
  num,
  pct,
  change,
  avg,
  trendOf,
  // 评级函数
  levelByBounce,
  levelByDuration,
  levelByPvPerUv,
  overallGrade,
  // 核心构建
  buildSiteData,
  buildDayStats,
  buildOverviewData,
  // AI 报告生成
  generateSiteAIReport,
  generateOverviewAI
};
