export interface VlanDayData {
  full: string;
  short: string;
  level: string;
  mb: number;
  reportedName: string;
  reportDate: string;
  source?: string;
}

export interface VlanHistory {
  id: number;
  number: number;
  name: string;
  fullName: string;
  days: Record<string, VlanDayData>;
  originalName: string;
  firstSeen: string;
  lastReportedName: string;
}

export interface Vlan {
  id: number;
  number: number;
  name: string;
  fullName: string;
  level: string;
  mb: number;
  display: string;
  shortDisplay: string;
}

export interface DailyReport {
  vlans: Vlan[];
  weak: number[];
  date: string;
  parsedAt: string;
  source?: string;
  network?: string;
}

export interface Network {
  id: string;
  name: string;
  vlanData: Record<string, VlanHistory>;
  dailyReports: Record<string, DailyReport>;
  dates: string[];
  created: string;
  lastModified: string;
}

export interface AlertItem {
  type: string;
  vlan: number;
  name: string;
  point: string;
  from: number;
  to: number;
  percent: number;
  size: 'big' | 'medium' | 'small';
  originalSize: number;
  dropAmount?: number;
  increaseAmount?: number;
}

export interface AlertHistory {
  urgent: AlertItem[];
  warning: AlertItem[];
  info: AlertItem[];
  timestamp: string;
  date: string;
  comparedWith: string;
}

export type TabType = 'input' | 'all' | 'weak' | 'days' | 'backup';
