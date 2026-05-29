/*
  1) Deploy Code.gs เป็น Google Apps Script Web App
  2) Copy URL ที่ลงท้าย /exec มาใส่ใน WEB_APP_URL
  3) ห้ามใส่ // comment ต่อท้ายบรรทัด config เพราะอาจทำให้ GitHub Pages อ่านผิดเมื่อถูก minify
*/
window.DRUG_APP_CONFIG = {
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbxfnYvSeQXdnb9eic6-xp-_inkTplPNgzSONpwEp3SdfeSTmvdOOOBh7oJk_xIksb51/exec',
  APP_TOKEN: '',
  POLL_INTERVAL_MS: 5000,
  PAGE_SIZE: 60
};
