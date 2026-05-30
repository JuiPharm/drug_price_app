/*
  1) Deploy Code.gs เป็น Google Apps Script Web App
  2) Copy URL ที่ลงท้าย /exec มาใส่ใน WEB_APP_URL
  3) ห้ามใส่ // comment ต่อท้ายบรรทัด config เพราะอาจทำให้ GitHub Pages อ่านผิดเมื่อถูก minify
*/
window.DRUG_APP_CONFIG = {
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbwCOXnxaL6WPbPqFGOEEbOrlwaYf8a4ruf4R4mRao6YbHcxPQS7gJl_O7A46fX8RipK/exec',
  APP_TOKEN: '',
  POLL_INTERVAL_MS: 5000,
  PAGE_SIZE: 60
};
