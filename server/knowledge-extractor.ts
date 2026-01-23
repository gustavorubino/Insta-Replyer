import * as cheerio from "cheerio";

export interface ExtractedContent {
  title: string;
  content: string;
}

// Sanitize text to remove null bytes and invalid UTF-8 characters
function sanitizeText(text: string): string {
  return text
    // Remove null bytes (0x00)
    .replace(/\x00/g, "")
    // Remove other control characters except newline, tab, carriage return
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // Remove surrogate pairs that are invalid
    .replace(/[\uD800-\uDFFF]/g, "")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim();
}

interface PdfData {
  text: string;
  info?: {
    Title?: string;
  };
}

export async function extractFromUrl(url: string): Promise<ExtractedContent> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KnowledgeBot/1.0)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  $("script").remove();
  $("style").remove();
  $("nav").remove();
  $("footer").remove();
  $("header").remove();
  $("aside").remove();
  $("noscript").remove();
  $("iframe").remove();
  $('[role="navigation"]').remove();
  $('[role="banner"]').remove();
  $('[role="contentinfo"]').remove();
  $('[class*="ad-"]').remove();
  $('[class*="ads-"]').remove();
  $('[class*="advertisement"]').remove();
  $('[id*="ad-"]').remove();
  $('[id*="ads-"]').remove();
  $('[class*="sidebar"]').remove();
  $('[class*="cookie"]').remove();
  $('[class*="popup"]').remove();
  $('[class*="modal"]').remove();
  $('[class*="newsletter"]').remove();
  $('[class*="social"]').remove();

  const title = $("title").text().trim() || 
                $("h1").first().text().trim() || 
                $('meta[property="og:title"]').attr("content") || 
                "Untitled";

  const mainContent = $("main").text() || 
                      $("article").text() || 
                      $('[role="main"]').text() || 
                      $(".content").text() || 
                      $("#content").text() || 
                      $("body").text();

  const content = mainContent
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();

  return { title, content };
}

export async function extractFromPdf(buffer: Buffer): Promise<ExtractedContent> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse");
  const data: PdfData = await pdfParse(buffer);
  
  // Sanitize the extracted text to remove null bytes and invalid characters
  const content = sanitizeText(data.text);
  const title = sanitizeText(data.info?.Title || "PDF Document");

  return { title, content };
}

export function extractFromText(content: string): ExtractedContent {
  const sanitizedContent = sanitizeText(content);
  const lines = sanitizedContent.split("\n");
  const title = lines[0]?.substring(0, 100) || "Text Document";
  
  return { 
    title: sanitizeText(title), 
    content: sanitizedContent 
  };
}
