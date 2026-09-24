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



---

## Pricing Engine v2 (2026-09)

ระบบคำนวณราคาได้รับการเพิ่ม Pricing Policy v2 โดยใช้ logic เดียวกันในหน้า Calculator,
ปุ่ม **คำนวณราคาอัตโนมัติ** ในหน้ารายละเอียดยา และการนำเข้า Excel

### ค่าเริ่มต้น

- IPD = `OPD × 1.20`
- Foreign OPD = `OPD × 1.30`
- Foreign IPD = `IPD × 1.30`
- Government pre-floor = `IPD × 0.70`
- NHSO pre-floor = `IPD × 0.60`
- Government final = `MAX(OPD, Government pre-floor)`
- NHSO final = `MAX(OPD, NHSO pre-floor)`

ผู้ใช้สามารถแก้สูตร IPD / Foreign / Gov / NHSO, วิธีปัดราคา, floor policy และ Historical GM anchors
ได้จากแท็บ **ตั้งค่า** โดยค่า settings จะถูกเก็บไว้ใน browser ของผู้ใช้ (localStorage)

### โหมดคำนวณ OPD

1. **Historical Suggested GM** — ใช้ Smooth historical GM curve ตามต้นทุน
2. **Target GM** — `OPD = Cost / (1 - GM)`
3. **กำหนด OPD Price** — คำนวณ Actual Gross Margin และ Markup ย้อนกลับ

### อัปเกรด Google Apps Script

เพื่อให้บันทึก **Government OPD** และ `gross_margin_gov` ลง Google Sheet ได้:

1. เปิด Google Sheet > Extensions > Apps Script
2. แทนที่โค้ดเดิมด้วย `Code.gs` เวอร์ชันล่าสุดจาก repository
3. กด Save
4. รันฟังก์ชัน `setup()` หนึ่งครั้ง และอนุญาตสิทธิ์หากระบบร้องขอ
5. ตรวจว่าในชีต `DataBase` มีคอลัมน์:
   - `government_opd_price`
   - `gross_margin_gov`
6. Deploy > Manage deployments > Edit > **New version** > Deploy
7. กลับหน้าเว็บแล้วกด **Refresh**

> คอลัมน์ สกย. เดิมไม่ถูกเปลี่ยนความหมายหรือเขียนทับด้วย Government pricing เพื่อรักษา compatibility กับข้อมูลเดิม


---

# Pricing Management Workflow v3

เวอร์ชันนี้ยกระดับระบบจากเครื่องคำนวณราคาเป็น **Drug Pricing Management System**
โดยแยก Current Price ออกจาก Proposed Price และมี Approval / Audit Trail

## Architecture

```text
DataBase (ราคาที่ใช้งานจริง)
        ↑
        │ Apply only after approval
        │
Pricing_Proposals
        ↑
        │ Submit
        │
Pricing Calculator ← Central Pricing_Settings
        │
        └──────────────→ Pricing_History
```

Google Spreadsheet จะมีชีตเพิ่มอัตโนมัติเมื่อรัน `setup()`:

- `Pricing_Settings` — Central Pricing Policy สำหรับทุก user
- `Pricing_Proposals` — ข้อเสนอราคาและสถานะ Pending / Approved / Rejected / Cancelled
- `Pricing_History` — Audit trail รวมราคาก่อน/หลัง, ผู้ดำเนินการ, เวลา และ policy snapshot

## Production setup ที่ต้องทำหลัง Update Code.gs

### 1. Update Apps Script

1. เปิด Google Sheet > Extensions > Apps Script
2. Copy `Code.gs` ล่าสุดจาก repository ไปแทนไฟล์เดิม
3. Save
4. Run `setup()` หนึ่งครั้ง
5. อนุญาตสิทธิ์ Google หากถูกถาม

หลัง Run สำเร็จให้ตรวจว่ามี:

- `DataBase`
- `Pricing_Settings`
- `Pricing_Proposals`
- `Pricing_History`

### 2. ตั้ง Approver PIN

Approver PIN **ห้ามเก็บใน GitHub หรือ config.js**

ใน Apps Script:

1. เปิด **Project Settings**
2. ไปที่ **Script Properties**
3. เพิ่ม Property:
   - Property: `PRICING_APPROVER_PIN`
   - Value: PIN ที่กำหนดโดยผู้ดูแลระบบ
4. Save

PIN นี้ใช้สำหรับ:
- Approve proposal
- Reject proposal
- เปลี่ยน Central Pricing Policy
- Reset Pricing Policy

### 3. Redeploy Apps Script

1. Deploy > Manage deployments
2. Edit deployment ปัจจุบัน
3. Version > **New version**
4. Deploy
5. URL `/exec` เดิมสามารถใช้ต่อได้ถ้าแก้ deployment เดิม

## Workflow การตั้งราคา

1. เปิด **รายการยา**
2. เลือกรายการยา
3. กด **เสนอปรับราคา**
4. ระบบส่ง Cost / Current OPD / Drug context ไป Pricing Calculator
5. เลือก:
   - Historical Suggested GM
   - Target GM
   - กำหนด OPD Price
6. ตรวจ OPD / IPD / Foreign / Government / NHSO
7. ระบุผู้เสนอและหมายเหตุ
8. กด **ส่งข้อเสนอเพื่ออนุมัติ**
9. Proposal มีสถานะ `PENDING`
10. ผู้อนุมัติเปิดแท็บ **ข้อเสนอราคา**
11. กด **Approve & Apply** และใส่ Approver PIN
12. Backend:
    - ตรวจ PIN
    - อัปเดต Current Price ใน `DataBase`
    - เปลี่ยน proposal เป็น `APPROVED`
    - บันทึก Before / After ลง `Pricing_History`

ถ้า Reject จะไม่มีการแก้ราคาใน DataBase

## Server-side protection

สำหรับรายการยาที่มีอยู่แล้ว ฟิลด์ต่อไปนี้ไม่สามารถถูกแก้โดย `save` หรือ Excel update ปกติ:

- ราคา OPD
- ราคา IPD
- ราคา OPD_Foreigner
- ราคา IPD_Foreigner
- government_opd_price
- nhso_heart_price
- Gross margin ที่เกี่ยวข้อง

การเปลี่ยนราคาต้องผ่าน `approve_pricing_proposal` เท่านั้น

ดังนั้นการแก้ DOM, การส่ง API save ปกติ หรือการนำเข้า Excel จะไม่ข้าม Pricing Approval Workflow ได้

## Central Pricing Policy

Pricing Settings ถูกเก็บใน `Pricing_Settings` และโหลดให้ user ทุกคนใช้ policy เดียวกัน

Browser localStorage ใช้เป็น **fallback/cache เท่านั้น** เมื่อ backend ไม่พร้อม

Central Policy ประกอบด้วย:

- IPD formula
- Foreign OPD/IPD formula
- Government formula
- NHSO formula
- Rounding policy
- OPD floor policy
- Historical GM anchors

ทุกครั้งที่แก้ Central Policy จะสร้าง record ใน `Pricing_History`

## Security boundary

ระบบปัจจุบันใช้:
- APP_TOKEN สำหรับ API access (ถ้ากำหนด)
- Approver PIN ที่เก็บใน Apps Script Script Properties สำหรับ Pricing authorization

สำหรับ environment ที่ต้องการ user identity/role แบบรายบุคคล แนะนำย้าย authentication ไป Supabase Auth / Google Workspace identity ใน phase ถัดไป โดย Pricing Workflow และ Audit schema รุ่นนี้สามารถนำไปใช้ต่อได้


---

# Government / NHSO Gross Tariff Policy v4

## Accounting interpretation

`government_opd_price` และ `nhso_heart_price` เป็น **ราคาตั้งก่อนส่วนลด (Gross/List Tariff)**

ส่วนลดที่เกิดตอนให้บริการ:
- Government OPD: ลด 30%
- NHSO OPD: ลด 40%

ราคาหลังส่วนลดไม่จำเป็นต้องเท่ากับ OPD แต่ต้อง **ไม่ต่ำกว่า OPD**

## Source-derived net target

จากข้อมูลเสนอราคายาเดิม pattern ของราคา Government/NHSO ทำหน้าที่เหมือนราคาสุทธิเป้าหมายหลังส่วนลด:

```text
Gov Net Target  = MAX(OPD, CEIL(IPD × 0.70))
NHSO Net Target = MAX(OPD, CEIL(IPD × 0.60))
```

จึงต้อง Gross-up ก่อนบันทึกเป็นราคาป้าย:

```text
Government Gross Tariff = CEIL(Gov Net Target / 0.70)
NHSO Gross Tariff       = CEIL(NHSO Net Target / 0.60)
```

Expected realized revenue:

```text
Government After Discount = Government Gross × 0.70
NHSO After Discount       = NHSO Gross × 0.60
```

Backend จะตรวจว่า:

```text
Government After Discount >= OPD
NHSO After Discount >= OPD
```

และคำนวณ `gross_margin_gov` / `gross_margin_nhso` จาก **ราคาหลังส่วนลด** ไม่ใช่จากราคาป้ายก่อนส่วนลด

## Mandatory policy

Government/NHSO discount และ OPD floor ถูกล็อกใน Code:
- Government discount = 30%
- NHSO discount = 40%
- Gross tariff ปัดขึ้นเต็มบาท
- After-discount revenue ต้องไม่ต่ำกว่า OPD

ไม่สามารถแก้ % discount หรือปิด floor จากหน้า Settings ได้

IPD / Foreign formula, OPD pricing mode, GM curve และ OPD/IPD rounding policy ยังปรับได้ตาม Workflow

## Database fields

```text
government_opd_price            Gross tariff ก่อนลด 30%
government_after_discount_est   รายรับคาดการณ์หลังลด 30%
nhso_heart_price                Gross tariff ก่อนลด 40%
nhso_after_discount_est         รายรับคาดการณ์หลังลด 40%
pricing_tariff_version          GROSS_DISCOUNT_V1
gross_margin_gov                GM จาก government_after_discount_est
gross_margin_nhso               GM จาก nhso_after_discount_est
```

## Upgrade existing Database

หลัง Update `Code.gs` และ Run `setup()`:

1. สำรอง Google Sheet ก่อน
2. Run `previewGovNhsoGrossTariffMigration()` เพื่อตรวจจำนวนและตัวอย่างรายการที่จะเปลี่ยน
3. ตรวจผลใน Execution log
4. เมื่อยืนยันแล้ว Run `migrateLegacyGovNhsoToGrossTariff()` หนึ่งครั้ง
5. ตรวจคอลัมน์ `government_opd_price`, `government_after_discount_est`, `nhso_heart_price`, `nhso_after_discount_est`, `pricing_tariff_version`
6. Redeploy Apps Script เป็น New version

Migration จะข้าม row ที่มี `pricing_tariff_version = GROSS_DISCOUNT_V1` อยู่แล้ว

## Example

OPD 46 / IPD 108:

```text
Gov Net Target = MAX(46, CEIL(108×0.70)) = 76
Government Gross = CEIL(76/0.70) = 109
After 30% discount = 109×0.70 = 76.30 >= OPD 46

NHSO Net Target = MAX(46, CEIL(108×0.60)) = 65
NHSO Gross = CEIL(65/0.60) = 109
After 40% discount = 109×0.60 = 65.40 >= OPD 46
```
