import express from "express";
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const router = express.Router();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapeTaladrod() {
  const searchUrl = "https://www.taladrod.com/w40/isch/schc.aspx?fno:new";

  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    defaultViewport: null,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
  await delay(2000);

  let cid = await page.evaluate(() => {
    const carElement = document.querySelector("tr.tr_caridx0 div[rel]");
    return carElement ? carElement.getAttribute("rel") : null;
  });

  if (!cid) {
    console.error("ไม่พบค่า cid");
    await browser.close();
    return;
  }

  let skippedCids = 0;
  let consecutiveSkippedCids = 0;
  let retryCount = 0;
  let carCount = 0;
  let failedCids = [];
  const maxCars = 10; //Infinity

  const dataDir = path.join(__dirname, "..", "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }
  const writeStream = fs.createWriteStream(
    path.join(dataDir, "taladrodData.json"),
    { flags: "a" }
  );
  writeStream.write("[");

  while (consecutiveSkippedCids < 10 && carCount < maxCars) {
    try {
      const url = `https://www.taladrod.com/w40/icar/cardet.aspx?cid=${cid}`;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await delay(250);

      const carData = await page.evaluate(() => {
        const titleElement = document.querySelector(".CD_MMT_Title");
        const titleText = titleElement ? titleElement.textContent.trim() : "";

        const yearMatch = titleText.match(/(\d{4})/);
        const brandMatch = titleText.match(/(\b[A-Z]+)\s/);
        const serieMatch = titleText.match(/(?:\d{4}\s[A-Z]+\s)(.*?)(?:,)/);

        const year = yearMatch ? yearMatch[1] : null;
        const brand = brandMatch ? brandMatch[1] : null;
        const serie = serieMatch ? serieMatch[1] : null;

        const detailElement = document.querySelector(
          'div[style*="text-align:left;color:#999;margin-top:10px"]'
        );
        const detailText = detailElement
          ? detailElement.textContent.trim()
          : "";

        const colorMatch = detailText.match(/สี(\S+)/);
        const gearMatch = detailText.match(/(เกียร์ออโต้|เกียร์ธรรมดา)/);
        const locationMatch = detailText.match(
          /กรุงเทพฯ|เชียงใหม่|นครราชสีมา|ขอนแก่น|ชลบุรี/
        );

        const color = colorMatch ? colorMatch[1] : null;
        const gear = gearMatch ? gearMatch[1] : null;
        const location = locationMatch ? locationMatch[0] : null;

        const mileageMatch = detailText.match(/เลขไมล์\s([\d,]+)\sกม\./);
        const mileage = mileageMatch ? mileageMatch[1].replace(/,/g, "") : null;

        const priceElement = document.querySelector(".prcTxt");
        const price = priceElement
          ? priceElement.textContent.trim().replace(/,/g, "")
          : null;

        return {
          year,
          brand,
          serie,
          color,
          gear,
          mileage,
          price,
          location,
        };
      });

      if (carCount > 0) {
        writeStream.write(",");
      }
      writeStream.write(JSON.stringify(carData, null, 2));

      carCount++;
      process.stdout.write(`\r⭕ ดึงข้อมูลรถไปแล้ว ${carCount} คัน`);

      skippedCids = 0;
      consecutiveSkippedCids = 0;
      retryCount = 0;
      cid--;
    } catch (error) {
      console.error("Error processing CID:", cid, error.message);
      retryCount++;
      if (retryCount >= 3) {
        skippedCids++;
        consecutiveSkippedCids++;
        failedCids.push(cid);
        retryCount = 0;
        cid--;
      }
    }

    const randomDelay = Math.floor(Math.random() * 500) + 500;
    await delay(randomDelay);
  }

  writeStream.write("]");
  writeStream.end();

  await browser.close();
  await prisma.$disconnect();

  console.log(`\n❌ จำนวนรายการที่ดึงข้อมูลไม่สำเร็จ: ${failedCids.length}`);
  if (failedCids.length > 0) {
    console.log(
      `❌ รายการ cid ที่ดึงข้อมูลไม่สำเร็จและถูกข้ามไป: ${failedCids.join(
        ", "
      )}`
    );
  } else {
    console.log("❌ รายการ cid ที่ดึงข้อมูลไม่สำเร็จและถูกข้ามไป: 0");
  }
}

// สร้าง API endpoint
router.get("/", async (req, res) => {
  try {
    await scrapeTaladrod();
    res.send("⭕ ดึงข้อมูล Taladrod เสร็จสิ้น");
  } catch (error) {
    console.error("❌ Error in scraping:", error.message);
    res.status(500).send("Error occurred during scraping.");
  }
});

export default router;
