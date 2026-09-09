# Drug Price App - Easy Deploy Version

เวอร์ชันนี้ออกแบบให้ Deploy ง่ายที่สุด:

- ไม่ใช้ React
- ไม่ใช้ Vite
- ไม่ต้อง npm install
- ไม่ต้อง build
- อัปโหลดไฟล์ขึ้น GitHub Pages ได้เลย
- Google Sheet ใช้ Apps Script `Code.gs` เป็น API

## โครงสร้างไฟล์

```text
Code.gs          # วางใน Google Apps Script
index.html       # อัปโหลดขึ้น GitHub Pages
styles.css       # อัปโหลดขึ้น GitHub Pages
app.js           # อัปโหลดขึ้น GitHub Pages
config.js        # ใส่ Apps Script Web App URL แล้วอัปโหลดขึ้น GitHub Pages
README.md
```

## 1) เตรียม Google Sheet

ข้อมูลต้องเป็นรูปแบบนี้:

- Header อยู่ Row 1
- Data เริ่ม Row 2
- ชื่อชีต default ในโค้ดคือ `DataBase`

ถ้าชื่อชีตไม่ใช่ `DataBase` ให้แก้ใน `Code.gs`:

```js
const CONFIG = {
  SHEET_NAME: 'DataBase',
  HEADER_ROW: 1,
  DATA_START_ROW: 2,
  ...
};
```

## 2) ติดตั้ง Apps Script

1. เปิด Google Sheet
2. ไปที่ Extensions > Apps Script
3. ลบ code เดิม แล้ววาง `Code.gs`
4. กด Save
5. เลือก function `setup`
6. กด Run 1 ครั้ง
7. อนุญาตสิทธิ์ตามที่ Google ขอ

`setup()` จะทำงานเหล่านี้:

- สร้าง `row_id`
- สร้าง `updated_at`, `created_at`
- สร้าง Column คำนวณ Discount 20%
- สร้าง Column after discount - Cost
- สร้าง Column gross margin
- ลบเฉพาะ Column ว่างท้ายตารางที่ Header Row 1 ว่าง
- กันการสร้าง Column ระบบซ้ำ

## 3) Deploy Apps Script เป็น Web App

1. Apps Script > Deploy > New deployment
2. Type: Web app
3. Execute as: Me
4. Who has access: Anyone with the link
5. Deploy
6. Copy Web App URL ที่ลงท้าย `/exec`

ทดสอบ URL:

```text
https://script.google.com/macros/s/xxxxx/exec?action=ping
```

ควรเห็น JSON ประมาณนี้:

```json
{"ok":true,"now":"..."}
```

## 4) ตั้งค่า config.js

เปิด `config.js` แล้วใส่ Web App URL:

```js
window.DRUG_APP_CONFIG = {
  WEB_APP_URL: 'https://script.google.com/macros/s/xxxxx/exec',
  APP_TOKEN: '',
  POLL_INTERVAL_MS: 5000,
  PAGE_SIZE: 60
};
```

สำคัญ: อย่าใส่ `// comment` ต่อท้ายบรรทัด config เพราะอาจทำให้ GitHub Pages อ่านไฟล์ผิดเมื่อถูกแก้เป็นบรรทัดเดียว

## 5) Deploy GitHub Pages แบบง่าย

1. เปิด repo GitHub เช่น `drug_price_app`
2. Upload ไฟล์เหล่านี้ไปที่ root repo:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `config.js`
3. ไปที่ Settings > Pages
4. Source: Deploy from a branch
5. Branch: `main` / folder: `/root`
6. Save

เว็บจะเปิดได้ที่:

```text
https://USERNAME.github.io/REPOSITORY_NAME/
```

## Function ที่รองรับ

### 1. นำเข้าข้อมูลจาก Excel (Excel Upload & Import) 🚀 ใหม่!

ระบบรองรับการนำเข้าไฟล์ข้อมูลยาและราคาจากไฟล์ Excel และ CSV โดยประมวลผลบนเบราว์เซอร์ (Client-side) ด้วย SheetJS:

- **รองรับไฟล์**: `.xlsx`, `.xls` และ `.csv`
- **ลากวางไฟล์ (Drag & Drop)** หรือคลิกเลือกไฟล์จากเครื่อง
- **เลือก Sheet ได้**: หากไฟล์มีหลายแผ่นงาน สามารถเลือกชีตที่ต้องการได้
- **Smart Column Auto-Mapping**: ตรวจจับและจับคู่ชื่อคอลัมน์ให้อัตโนมัติ (เช่น `item_code`, `รหัสยา`, `ชื่อยา`, `FullName`, `ราคาต้นทุน`, `ราคา OPD` ฯลฯ) พร้อม Dropdown ให้ตรวจสอบและปรับเปลี่ยนได้
- **3 โหมดการนำเข้า**:
  1. `Upsert (แนะนำ)`: อัปเดตรายการเดิมถ้ามี `item_code` ตรงกัน และเพิ่มรายการใหม่ถ้ายังไม่มีในระบบ
  2. `Add Only`: เพิ่มเป็นรายการใหม่เท่านั้น (ข้ามรายการที่มีอยู่แล้ว)
  3. `Update Only`: อัปเดตเฉพาะรายการที่มี `item_code` ตรงกับในฐานข้อมูล
- **คำนวณราคาอัตโนมัติ**: คำนวณส่วนลด 20%, ส่วนต่างหลังส่วนลด - ต้นทุน, Gross Margin, และราคา IPD/ต่างชาติให้อัตโนมัติหากไม่ได้กรอกมาในไฟล์
- **ตัวอย่างข้อมูล (Preview Table)**: แสดงตัวอย่างแถวที่จะนำเข้า พร้อมป้ายสถานะ (เพิ่มใหม่ / อัปเดตเดิม) และตรวจจับรายการที่หลังส่วนลดต่ำกว่าทุน
- **Fast Batch Engine**: ส่งข้อมูลเป็นชุด (Batch chunks) พร้อมแถบแสดงความคืบหน้า (Progress Bar) แบบเรียลไทม์ และมีระบบ Fallback อัตโนมัติ

### 2. ดาวน์โหลดแม่แบบ Excel (Template.xlsx) 📥

กดปุ่ม "ดาวน์โหลดแม่แบบ Excel" ในหน้าต่างนำเข้า เพื่อรับไฟล์ `.xlsx` ที่จัดเตรียมหัวคอลัมน์และตัวอย่างข้อมูลยาไว้ครบถ้วน สามารถนำไปกรอกข้อมูลแล้วอัปโหลดกลับเข้าสู่ระบบได้ทันที

### 3. ส่งออกข้อมูลเป็น Excel (Export Excel) 📤

กดปุ่ม **"📤 Export Excel"** ในแถบเครื่องมือ เพื่อส่งออกข้อมูลยาทั้งหมด หรือเฉพาะรายการที่กำลังกรองผ่านช่องค้นหา ออกมาเป็นไฟล์ `.xlsx` พร้อมระบุวันที่ดาวน์โหลดในชื่อไฟล์

---

### 4. ค้นหาและกรองข้อมูลเร็ว

พิมพ์บางตัวอักษรเพื่อค้นหาได้ทันที:
- ชื่อยา: เช่น `cream`, `paracetamol`
- รหัสยา: เช่น `5105`, `4216`
- รูปแบบยา: เช่น `VIA`, `TAB`, `CAP`

### 5. ดูและแก้ไขข้อมูลรายตัว (Card & Modal)

- แสดงรายการยาในรูปแบบ Card พร้อมป้ายเตือนราคาต่ำกว่าทุน
- คลิกการ์ดเพื่อเปิดดูรายละเอียดและแก้ไขข้อมูล
- ปุ่มคำนวณราคาอัตโนมัติ (OPD = สกย., IPD = OPD + 30%, ต่างชาติ = +30%)
- บันทึกลง Google Sheet แบบเรียลไทม์

### 6. เครื่องมือคำนวณ Gross Margin

- คำนวณราคาขายที่ควรตั้งจาก % Gross Margin ที่ต้องการ
- คำนวณ % Gross Margin จากราคาต้นทุนและราคาขาย

---

## Floating Back button for mobile

- แสดงเมื่อเปิด Modal, อยู่ใน Tab อื่น, หรือ scroll ลงมามากกว่า 120px
- กดแล้วจะปิด Modal ก่อน
- ถ้าอยู่ Tab คำนวณ/ตั้งค่า จะกลับไป Tab รายการยา
- ถ้าอยู่หน้าเดิมและ scroll ลงมา จะเลื่อนกลับด้านบน

## การอัปเกรด Google Apps Script เพื่อใช้ Fast Batch Import

เพื่อความเร็วสูงสุดในการนำเข้าข้อมูลจำนวนมาก (1,000+ แถว ใน 2-3 วินาที):
1. เปิด Google Sheet > **Extensions** > **Apps Script**
2. คัดลอกโค้ดทั้งหมดจากไฟล์ `Code.gs` ไปวางทับโค้ดเดิม
3. กด **Save** (ไอคอนแผ่นดิสก์)
4. กด **Deploy** > **Manage deployments** > กดรูปดินสอ (Edit) > Version เลือก **New version** > กด **Deploy**

## การแก้ปัญหา (Troubleshooting)

### เว็บไม่แสดงข้อมูล
1. ตรวจสอบว่า `config.js` ใส่ URL `/exec` ถูกต้องหรือไม่
2. Apps Script Web App ตั้งสิทธิ์เป็น `Anyone with the link` หรือไม่
3. ชื่อ Sheet ใน `Code.gs` ตรงกับชื่อชีตใน Google Sheet หรือไม่ (`DataBase`)
4. ไปที่แท็บ "ตั้งค่า" แล้วกด "ทดสอบ Apps Script" ว่าได้ JSON `ok: true` หรือไม่

### นำเข้า Excel แล้วคอลัมน์ไม่ตรง
- สามารถกดคลิกที่ **"🔗 การจับคู่คอลัมน์ (Column Mapping)"** ในหน้าต่างนำเข้า เพื่อเลือกคอลัมน์ที่ถูกต้องได้เองอย่างอิสระ

