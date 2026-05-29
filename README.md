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

## การแก้ปัญหา

### เว็บไม่แสดงข้อมูล

ตรวจ 4 จุดนี้:

1. `config.js` ใส่ URL `/exec` ถูกต้องหรือไม่
2. Apps Script Web App ตั้ง `Anyone with the link` หรือไม่
3. ชื่อ Sheet ใน `Code.gs` ตรงกับ Google Sheet หรือไม่
4. ทดสอบ `?action=ping` ผ่านหรือไม่

### Click รายการแล้วข้อมูลบางช่องไม่แสดง

เวอร์ชันนี้แก้แล้ว:

- ค่า `0` จะแสดงเป็น `0.00`
- ช่องว่างจริงจะแสดงเป็นช่องว่าง/ขีด
- Modal render ทุก header ที่ Google Sheet ส่งมา

### แก้ข้อมูลแล้วไม่ update

หลัง Save ระบบใช้ POST แบบ `no-cors` ไป Apps Script แล้ว reload ข้อมูลใหม่ภายในประมาณ 1-2 วินาที ถ้าไม่เปลี่ยนให้ Refresh อีกครั้ง และตรวจ Apps Script Executions ว่ามี error หรือไม่


## Floating Back button for mobile

เวอร์ชันนี้เพิ่มปุ่ม `← กลับ` แบบ floating สำหรับมือถือแล้ว:

- แสดงเมื่อเปิด Modal, อยู่ใน Tab อื่น, หรือ scroll ลงมามากกว่า 120px
- กดแล้วจะปิด Modal ก่อน
- ถ้าอยู่ Tab คำนวณ/ตั้งค่า จะกลับไป Tab รายการยา
- ถ้าอยู่หน้าเดิมและ scroll ลงมา จะเลื่อนกลับด้านบน
