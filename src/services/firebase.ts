import { initializeApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";

const firebaseConfig = {
  databaseURL: "https://eskandernet-default-rtdb.firebaseio.com/"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export async function fetchFirebaseData(networkName: string) {
  const colors = ['purple', 'green', 'orange', 'red'];
  let finalPayload = "";

  for (const col of colors) {
    try {
      const dbPath = ref(db, `${networkName}/messages/${col}/message`);
      const snapshot = await get(dbPath);
      const data = snapshot.val();

      if (data && typeof data === 'string' && 
          !data.includes("لا يوجد تقرير") && 
          !data.includes("جاري التحميل")) {
        
        let cleanText = data.trim();
        
        // Handle specific Firebase report format if needed
        if (cleanText.includes('Router:') && cleanText.includes('Time:')) {
          const colorName = col.charAt(0).toUpperCase() + col.slice(1);
          const regex = new RegExp(`${colorName}\\s*\\(\\d+\\)\\s*\\|\\s*([\\s\\S]+?)(?=(?:\\s*\\|\\s*(?:Green|Orange|Red|Purple|$)))`, 'i');
          const match = cleanText.match(regex);
          
          if (match && match[1]) {
            const vlanPart = match[1].trim();
            const vlanLines = vlanPart.split(/\s*\|\s*(?=V\d+:)/i)
              .filter(v => v.trim())
              .map(v => {
                const vlanMatch = v.trim().match(/V(\d+)[:\s]+(\d+)\s*MB\s*[-\s]+([\s\S]+)/i);
                if (vlanMatch) {
                  const symbol = col === 'purple' ? '🟣' : 
                                col === 'green' ? '🟢' : 
                                col === 'orange' ? '🟠' : '❌';
                  return `${symbol} V${vlanMatch[1]}: ${vlanMatch[2]} MB - ${vlanMatch[3].trim()}`;
                }
                return '';
              })
              .filter(v => v)
              .join('\n');
            
            if (vlanLines) {
              finalPayload += vlanLines + "\n";
            }
          }
        } else {
          // Standard format
          finalPayload += cleanText + "\n";
        }
      }
    } catch (error) {
      console.error(`Error fetching ${col} from Firebase:`, error);
    }
  }

  return finalPayload.trim();
}
