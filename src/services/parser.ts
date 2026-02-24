import { Vlan } from "../types";

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
