import puppeteer from 'puppeteer'
import { resolve } from 'path'

const sizes = [16, 48, 128] as const

async function main(): Promise<void> {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()

  const svgPath = 'file:///' + resolve('icons', 'icon.svg').split('\\').join('/')

  for (const size of sizes) {
    await page.setViewport({ width: size, height: size })
    await page.goto(svgPath)
    await page.screenshot({
      path: resolve('icons', `icon-${String(size)}.png`),
      omitBackground: true,
    })
    console.log(`Saved icon-${String(size)}.png`)
  }

  await browser.close()
}

void main()
