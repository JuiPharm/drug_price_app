# Drug Price Dashboard — Google Sheet + GitHub Pages

Web application สำหรับดูรายการยา ค้นหาแบบพิมพ์บางตัวอักษร แก้ไขราคา เพิ่มรายการใหม่ คำนวณ Gross Margin และบันทึกกลับ Google Sheet

## โครงสร้างไฟล์

```text
index.html      หน้า Web application
styles.css      Responsive UI / Card / Modal
app.js          Logic ค้นหา แสดงผล แก้ไข บันทึก และ Calculator
config.js       ใส่ Apps Script Web App URL
Code.gs         Google Apps Script API สำหรับอ่าน/เขียน Google Sheet
.nojekyll       ให้ GitHub Pages serve static files ตรงๆ
```

## วิธี Deploy แบบง่าย

### 1) เตรียม Google Sheet

1. เปิดไฟล์ Excel แล้ว Import/Upload เป็น Google Sheet
2. ให้ชื่อชีตเป็น `Sheet1` หรือแก้ `CONFIG.SHEET_NAME` ใน `Code.gs`
3. โครงสร้างไฟล์ตัวอย่างนี้ใช้ Header row ที่แถว 2 และข้อมูลเริ่มแถว 3

คอลัมน์หลักที่รองรับจากไฟล์ตัวอย่าง:

- `item_code`
- `GenercName`
- `FullName`
- `DosageForm`
- `Major Class`
- `Sub Class`
- `ราคาต้นทุน`
- `ราคา OPD`
- `ราคา IPD`
- `ราคา สกย. OPD`
- `ราคา สกย. IPD`
- `ราคา IPD_Foreigner`
- `ราคา OPD_Foreigner`
- `nhso_heart_price`
- `gross_margin_*`

`Code.gs` จะสร้างคอลัมน์ต่อไปนี้ให้อัตโนมัติถ้ายังไม่มี:

- `row_id`
- `created_at`
- `updated_at`
- `last_edited_by`
- `ราคาสกย.OPD Discount 20%`
- `ราคา สกย.IPD Discount 20%`
- `OPD สกย. after discount -Cost`
- `ราคา IPD สกย After dis count - Cost`

### 2) ติดตั้ง Apps Script

1. Google Sheet > Extensions > Apps Script
2. ลบโค้ดเดิม แล้ววางโค้ดจากไฟล์ `Code.gs`
3. กด Save
4. เลือก function `setup` แล้วกด Run 1 ครั้ง
5. Authorize ให้เรียบร้อย

ถ้าต้องการ token แบบง่าย:

```js
setAppToken('ตั้ง-token-ของคุณ')
```

จากนั้นใส่ token เดียวกันใน `config.js` ที่ `APP_TOKEN`

> หมายเหตุ: token ในเว็บ static ไม่ใช่ระบบ Login ที่ปลอดภัยเต็มรูปแบบ เพราะผู้ใช้เปิด source ดูได้ หากข้อมูลมีความลับ ควรทำ OAuth หรือ deploy หน้าเว็บเป็น Apps Script HTML Service แทน

### 3) Deploy Apps Script เป็น Web App

1. Apps Script > Deploy > New deployment
2. Select type > Web app
3. Execute as: `Me`
4. Who has access: เลือกตามการใช้งาน เช่น `Anyone with the link` หรือเฉพาะในองค์กร
5. กด Deploy แล้ว Copy Web App URL ที่ลงท้ายด้วย `/exec`

### 4) ตั้งค่า Frontend

เปิด `config.js` แล้วใส่ URL:

```js
window.DRUG_APP_CONFIG = {
  WEB_APP_URL: 'https://script.google.com/macros/s/xxxxx/exec',
  APP_TOKEN: '',
  POLL_INTERVAL_MS: 5000
};
```

### 5) Deploy GitHub Pages

1. สร้าง GitHub repository ใหม่
2. Upload ไฟล์ทั้งหมดใน folder นี้
3. ไปที่ Settings > Pages
4. Source: Deploy from a branch
5. Branch: `main` / root
6. เปิด URL GitHub Pages ที่ได้

## Function ที่รองรับ

### ค้นหาเร็ว

พิมพ์บางตัวอักษรได้ เช่น:

- ชื่อยา: `cream`
- รหัสยา: `5105`
- รูปแบบยา: `VIA`
- กลุ่มยา: `antidote`

ระบบค้นหาจาก `item_code`, `GenercName`, `FullName`, `DosageForm`, `Major Class`, `Sub Class`

### Card + Modal

- แสดงรายการยาเป็น Card
- กด Card เพื่อดูรายละเอียดครบถ้วน
- กด Edit เพื่อแก้ไขราคา/ข้อมูล
- กด Save เพื่อบันทึกลง Google Sheet

### เพิ่มรายการใหม่

เมื่อ Add รายการใหม่ ระบบจะตั้งค่าอัตโนมัติ:

- `ราคา OPD = ราคา สกย. OPD`
- `ราคา IPD = ราคา สกย. IPD`
- ถ้าไม่มีราคา IPD จะใช้ `ราคา IPD = ราคา OPD + 30%`
- `ราคา OPD_Foreigner = ราคา OPD + 30%`
- `ราคา IPD_Foreigner = ราคา IPD + 30%`

หลังจากเพิ่มแล้ว ผู้ใช้สามารถกลับมา Edit ราคาทุกช่องได้

### Gross Margin Calculator

สูตร:

```text
Gross margin = 100*((ราคาขาย-ราคาต้นทุน)/ราคาขาย)
```

มี 2 เครื่องมือ:

1. คำนวณราคาขายจาก % Gross Margin
2. คำนวณ % Gross Margin จากราคาขาย

### Warning เมื่อติดลบ

ระบบคำนวณ:

- `ราคาสกย.OPD Discount 20% = ราคา สกย. OPD * 0.8`
- `ราคา สกย.IPD Discount 20% = ราคา สกย. IPD * 0.8`
- `OPD สกย. after discount -Cost = ราคา สกย. OPD * 0.8 - ราคาต้นทุน`
- `ราคา IPD สกย After dis count - Cost = ราคา สกย. IPD * 0.8 - ราคาต้นทุน`

ถ้า OPD/IPD after discount - Cost ติดลบ หน้าเว็บจะ POP Confirm ก่อนบันทึก

## หมายเหตุเรื่อง Real-time

GitHub Pages เป็น static hosting จึงไม่มี server push/WebSocket ในตัว ระบบนี้ใช้ polling ทุก 5 วินาทีเพื่อดึงข้อมูลล่าสุดจาก Google Sheet ดังนั้นเมื่อแก้ข้อมูลใน Google Sheet หน้าเว็บจะ update ในรอบ refresh ถัดไป สามารถปรับความถี่ได้ที่ `POLL_INTERVAL_MS`
