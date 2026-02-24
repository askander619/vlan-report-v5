import { Network } from "../types";

const NETWORKS_KEY = 'vlan_networks';
const CURRENT_NET_KEY = 'vlan_current_network';
const ALERT_HISTORY_KEY = 'vlan_alert_history';

export const storage = {
  saveNetworks: (networks: Record<string, Network>) => {
    localStorage.setItem(NETWORKS_KEY, JSON.stringify(networks));
  },
  
  loadNetworks: (): Record<string, Network> => {
    const saved = localStorage.getItem(NETWORKS_KEY);
    if (!saved) {
      return {
        "network_1": {
          id: "network_1",
          name: "R1",
          vlanData: {},
          dailyReports: {},
          dates: [],
          created: new Date().toISOString(),
          lastModified: new Date().toISOString()
        },
        "network_2": {
          id: "network_2",
          name: "R2",
          vlanData: {},
          dailyReports: {},
          dates: [],
          created: new Date().toISOString(),
          lastModified: new Date().toISOString()
        }
      };
    }
    return JSON.parse(saved);
  },

  saveCurrentNetworkId: (id: string) => {
    localStorage.setItem(CURRENT_NET_KEY, id);
  },

  loadCurrentNetworkId: (): string => {
    return localStorage.getItem(CURRENT_NET_KEY) || "network_1";
  },

  saveAlertHistory: (history: any) => {
    localStorage.setItem(ALERT_HISTORY_KEY, JSON.stringify(history));
  },

  loadAlertHistory: (): any => {
    const saved = localStorage.getItem(ALERT_HISTORY_KEY);
    return saved ? JSON.parse(saved) : {};
  }
};
