import { Vlan, Network, AlertHistory, AlertItem, VlanHistory } from "../types";

export function parseReport(text: string) {
  const lines = text.split('\n');
  const vlans: Vlan[] = [];
  let parsedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line || line.length < 5) continue;

    // Match patterns like: 🟣 V123: 500 MB - Name
    const match = line.match(/([\u{1F7E0}-\u{1F7EB}❌🟣🟢🟠🔴🟧🟡🟩✅🟪🟦🔵])[\s\-:]*V(\d+)[\s\-:]*(\d+)[\s\-]*MB[\s\-]*([\s\S]+)/u);
    
    if (match) {
      let levelSymbol = match[1];
      const vlanNumber = parseInt(match[2]);
      const mb = parseInt(match[3]);
      let fullName = match[4].trim();

      // Normalize symbols
      levelSymbol = levelSymbol
        .replace(/\u{1F7E3}/gu, '🟣')
        .replace(/\u{1F7E2}/gu, '🟢')
        .replace(/\u{1F7E0}/gu, '🟠')
        .replace(/🔴/gu, '❌');

      vlans.push({
        id: vlanNumber,
        number: vlanNumber,
        name: fullName,
        fullName: fullName,
        level: levelSymbol,
        mb: mb,
        display: `${levelSymbol} ${mb}MB`,
        shortDisplay: `${levelSymbol}${mb}`
      });
      parsedCount++;
    }
  }

  return {
    vlans: vlans,
    stats: {
      totalLines: lines.length,
      parsedCount: parsedCount,
      success: parsedCount > 0,
      count: vlans.length
    }
  };
}

export function extractPortFromVlanName(vlanName: string) {
  if (!vlanName) return 'عام';
  const portMatch = vlanName.match(/E(\d+)/i);
  if (portMatch) return `E${portMatch[1]}`;
  const etherMatch = vlanName.match(/ether(\d+)/i);
  if (etherMatch) return `E${etherMatch[1]}`;
  return 'عام';
}

export function analyzeAfterSave(network: Network, todayDate: string): AlertHistory | null {
  const dates = [...network.dates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  if (dates.length < 2) return null;

  const todayIndex = dates.indexOf(todayDate);
  if (todayIndex < 1) return null;

  const yesterday = dates[todayIndex - 1];
  const alerts: AlertHistory = {
    urgent: [],
    warning: [],
    info: [],
    timestamp: new Date().toISOString(),
    date: todayDate,
    comparedWith: yesterday
  };

  Object.values(network.vlanData).forEach(vlan => {
    const todayData = vlan.days[todayDate];
    const yesterdayData = vlan.days[yesterday];
    if (!todayData || !yesterdayData) return;

    const diff = todayData.mb - yesterdayData.mb;
    const percent = (Math.abs(diff) / (yesterdayData.mb || 1)) * 100;
    const yesterdayMB = yesterdayData.mb;

    const isBigVlan = yesterdayMB >= 3000;
    const isMediumVlan = yesterdayMB >= 1000 && yesterdayMB < 3000;
    const isSmallVlan = yesterdayMB < 1000;

    const point = extractPortFromVlanName(vlan.name);

    // Rule 1: New Float
    if (todayData.level === '❌' && yesterdayData.level !== '❌') {
      const item: AlertItem = {
        type: 'new_float',
        vlan: vlan.number,
        name: vlan.name,
        point,
        from: yesterdayData.mb,
        to: todayData.mb,
        percent: 100,
        size: isBigVlan ? 'big' : isMediumVlan ? 'medium' : 'small',
        originalSize: yesterdayMB
      };
      if (isBigVlan) alerts.urgent.push({ ...item, type: 'new_float_big' });
      else if (isMediumVlan) alerts.warning.push({ ...item, type: 'new_float_medium' });
      else alerts.info.push({ ...item, type: 'new_float_small' });
    } 
    // Rule 2: Big Drop in Big Vlans
    else if (diff < 0 && isBigVlan) {
      if (percent > 50) {
        alerts.urgent.push({
          type: 'big_drop_critical',
          vlan: vlan.number,
          name: vlan.name,
          point,
          from: yesterdayData.mb,
          to: todayData.mb,
          percent: Math.round(percent),
          size: 'big',
          originalSize: yesterdayMB,
          dropAmount: Math.abs(diff)
        });
      } else if (percent > 20) {
        alerts.warning.push({
          type: 'big_drop_significant',
          vlan: vlan.number,
          name: vlan.name,
          point,
          from: yesterdayData.mb,
          to: todayData.mb,
          percent: Math.round(percent),
          size: 'big',
          originalSize: yesterdayMB,
          dropAmount: Math.abs(diff)
        });
      }
    } 
    // Rule 3: Medium Drop
    else if (diff < 0 && isMediumVlan && percent > 70) {
      alerts.warning.push({
        type: 'medium_drop',
        vlan: vlan.number,
        name: vlan.name,
        point,
        from: yesterdayData.mb,
        to: todayData.mb,
        percent: Math.round(percent),
        size: 'medium',
        originalSize: yesterdayMB
      });
    } 
    // Rule 4: Big Increase
    else if (diff > 0 && isBigVlan && percent > 100) {
      alerts.info.push({
        type: 'big_increase',
        vlan: vlan.number,
        name: vlan.name,
        point,
        from: yesterdayData.mb,
        to: todayData.mb,
        percent: Math.round(percent),
        size: 'big',
        originalSize: yesterdayMB,
        increaseAmount: diff
      });
    }
  });

  return alerts;
}

export function getConsumptionComparison(vlan: VlanHistory, date: string, dates: string[]) {
  const sortedDates = [...dates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const dateIndex = sortedDates.indexOf(date);
  if (dateIndex <= 0) return null;

  const currentDayData = vlan.days[date];
  const previousDate = sortedDates[dateIndex - 1];
  const previousDayData = vlan.days[previousDate];

  if (!currentDayData || !previousDayData) return null;

  const currentMB = currentDayData.mb || 0;
  const previousMB = previousDayData.mb || 0;
  const difference = currentMB - previousMB;

  if (Math.abs(difference) < 1) return null;

  const percentage = previousMB > 0 ? ((Math.abs(difference) / previousMB) * 100).toFixed(1) : '100';

  return {
    difference: parseFloat(difference.toFixed(1)),
    percentage: parseFloat(percentage),
    direction: difference > 0 ? 'up' : 'down'
  };
}
