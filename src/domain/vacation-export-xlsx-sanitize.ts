import JSZip from "jszip";

function columnToNumber(letters: string) {
  return [...letters].reduce(
    (value, letter) => value * 26 + (letter.charCodeAt(0) - 64),
    0,
  );
}

function parseRange(reference: string) {
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(reference);
  if (!match) return null;
  return {
    left: columnToNumber(match[1]),
    top: Number(match[2]),
    right: columnToNumber(match[3]),
    bottom: Number(match[4]),
  };
}

function columnToLetters(column: number) {
  let value = column;
  let letters = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

function sanitizeSheetXml(xml: string) {
  xml = xml.replace(/\shorizontalDpi="4294967295"/g, ' horizontalDpi="96"');
  xml = xml.replace(/\sverticalDpi="4294967295"/g, ' verticalDpi="96"');

  const mergeSection = xml.match(/<mergeCells[^>]*>[\s\S]*?<\/mergeCells>/);
  if (!mergeSection) return xml;

  const references = [
    ...mergeSection[0].matchAll(/<mergeCell ref="([^"]+)"/g),
  ].map((match) => match[1]);

  for (const reference of references) {
    const range = parseRange(reference);
    if (!range) continue;
    for (let row = range.top; row <= range.bottom; row += 1) {
      for (let column = range.left; column <= range.right; column += 1) {
        if (column === range.left && row === range.top) continue;
        const address = `${columnToLetters(column)}${row}`;
        xml = xml.replace(new RegExp(`<c r="${address}"[^>]*/>\\s*`, "g"), "");
        xml = xml.replace(
          new RegExp(`<c r="${address}"[^>]*>[\\s\\S]*?</c>\\s*`, "g"),
          "",
        );
      }
    }
  }

  return xml;
}

export async function sanitizeWorkbookForExcel(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const sheetPaths = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort();
  if (sheetPaths.length === 0) return buffer;

  for (const sheetPath of sheetPaths) {
    const xml = await zip.file(sheetPath)!.async("string");
    zip.file(sheetPath, sanitizeSheetXml(xml));
  }

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}
