import { Network, DailyReport } from "../types";

export async function getNetworks(): Promise<Network[]> {
  const res = await fetch("/api/networks");
  return res.json();
}

export async function getReports(networkId: string): Promise<DailyReport[]> {
  const res = await fetch(`/api/reports/${networkId}`);
  const reports = await res.json();
  return reports.map((r: any) => ({
    ...r,
    parsed_json: JSON.parse(r.parsed_json)
  }));
}

export async function saveReport(data: {
  networkId: string;
  reportDate: string;
  rawData: string;
  parsedJson: any;
  vlanNames: Record<number, string>;
}) {
  const res = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function getVlanNames(networkId: string): Promise<Record<number, string>> {
  const res = await fetch(`/api/vlan-names/${networkId}`);
  return res.json();
}

export async function deleteReport(networkId: string, date: string) {
  const res = await fetch(`/api/reports/${networkId}/${date}`, {
    method: "DELETE"
  });
  return res.json();
}
