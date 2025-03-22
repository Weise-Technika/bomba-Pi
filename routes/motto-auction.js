import express from "express";
import puppeteer from "puppeteer-core"; // ใช้ puppeteer-core แทน puppeteer
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

// ฟังก์ชัน delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// กำหนดค่า __filename และ __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ฟังก์ชันเพื่อดึงข้อมูลจาก element ที่ต้องการ
const scrapeData = async (page) => {
  const data = await page.evaluate(() => {
    const bidHistories = document.querySelectorAll(".bid-history");
    return Array.from(bidHistories).map(bidHistory => {
      const elements = bidHistory.querySelectorAll("span");
      return Array.from(elements).map(el => el.textContent.trim());
    });
  });

  // บันทึกข้อมูลลงไฟล์ JSON
  const outputFilePath = path.join(__dirname, "../data/motto-auction-data.json");

  let outputData = { bidHistories: [] };
  if (fs.existsSync(outputFilePath)) {
    const existingData = fs.readFileSync(outputFilePath, "utf-8");
    if (existingData) {
      outputData = JSON.parse(existingData);
    }
  }

  // เพิ่มข้อมูลใหม่เข้าไปใน outputData.bidHistories โดยไม่ซ้ำกับข้อมูลเดิม
  data.forEach((bidHistory, index) => {
    if (!outputData.bidHistories[index]) {
      outputData.bidHistories[index] = [];
    }
    bidHistory.forEach(item => {
      if (!outputData.bidHistories[index].includes(item)) {
        outputData.bidHistories[index].push(item);
      }
    });
  });

  fs.writeFileSync(outputFilePath, JSON.stringify(outputData, null, 4), "utf-8");
};

router.post("/", async (req, res) => {
  const link =
    "http://lanes.simulcast2.mottoauction.com/Account/Login?ReturnUrl=%2fsimulcast";

  let browser;
  try {
    browser = await puppeteer.launch({      
      executablePath: '/usr/bin/chromium',
      headless: true,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    await page.goto(link, { waitUntil: "domcontentloaded" });

    // คลิก dropdown เพื่อเลือกภาษาไทย
    await page.waitForSelector("#culture");
    await page.select("#culture", "th-TH");

    // คลิกที่ input field และกรอกอีเมล
    await page.waitForSelector('input[name="UserName"]');
    await page.focus('input[name="UserName"]');
    await page.type('input[name="UserName"]', process.env.USERNAME, {
      delay: 100,
    });

    // คลิกที่ input field สำหรับรหัสผ่านและกรอกรหัสผ่าน
    await page.waitForSelector('input[name="Password"]');
    await page.focus('input[name="Password"]');
    await page.type('input[name="Password"]', process.env.PASSWORD, { delay: 100 });

    // คลิกปุ่มเข้าสู่ระบบ
    await page.waitForSelector('button[type="submit"].btn-login');
    await page.click('button[type="submit"].btn-login');
    await delay(1000);

    // คลิกที่ checkbox เพื่อยอมรับข้อตกลงและเงื่อนไข
    await page.waitForSelector('input[name="terms"]');
    await page.click('input[name="terms"]');
   
    // คลิกปุ่มยอมรับ
    await page.waitForSelector("button#hidden");
    await page.click("button#hidden");

    console.log("🚀 Login สำเร็จ");
    
    // คลิกที่ลิงก์ "เข้าสู่การขาย" ทุกปุ่ม
    await delay(10000);

    let buttonClickCount = 0; 
    
    try {
      const enterSaleButtons = await page.$$("a.enter-sale");
      for (const button of enterSaleButtons) {
        await button.click();
        buttonClickCount++; 
        await delay(1000); 
      }
      console.log(`จำนวนปุ่มที่ถูกกด: ${buttonClickCount}`);
    } catch (err) {
      console.log("⚠️ ไม่พบปุ่มเข้าสู่การขาย หรือเข้าไปแล้ว");
    }
   
    // คลิกที่ลิงก์ "ปิดเสียง"
    try {
      await page.waitForSelector("a.turn-audio-off", { timeout: 30000 });
      await page.click("a.turn-audio-off");
    } catch (err) {
      console.log("⚠️ ไม่พบปุ่มปิดเสียง หรือปิดไปแล้ว");
    }

    // คลิกที่ลิงก์ "ปิด video"
    try {
      await page.waitForSelector("a.turn-video-off", { timeout: 30000 });
      await page.click("a.turn-video-off");
    } catch (err) {
      console.log("⚠️ ไม่พบปุ่มปิด video หรือปิดไปแล้ว");
    }

    while (true) {
      await scrapeData(page);
      try {
        await page.waitForFunction(
          () => {
            const elements = document.querySelectorAll(".bid-history");
            return elements.length > 0;
          },
          { timeout: 600000 }
        );
        console.log("⭕ ข้อมูลใหม่");
      } catch (error) {
        console.log("⚠️ การรอข้อมูลใหม่หมดเวลา");
      }
      await delay(5000);
    }

    // ปิดเบราว์เซอร์
    // await browser.close();
    res.send("Scraping done");
  } catch (error) {
    console.error("❌ เกิดข้อผิดพลาด:", error);
    res.status(500).send("Error occurred while scraping");
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error("❌ เกิดข้อผิดพลาดในการปิดเบราว์เซอร์:", closeError);
      }
    }
  }
});

export default router;

