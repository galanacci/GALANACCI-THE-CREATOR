import { test, expect } from "./fixtures/test.mjs";

test("homepage provides a complete static sharing card", async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  const expectedDescription = "Explore GALANACCI OS: an evolving archive of art, fashion, experiments and stories behind GALANACCI and PIONEERS OF GREATNESS.";

  expect(html).toContain('<title>GALANACCI THE CREATOR</title>');
  expect(html).toContain(`<meta name="description" content="${expectedDescription}">`);
  expect(html).toContain('<link rel="canonical" href="https://galanacci.com/">');
  expect(html).toContain('<meta property="og:title" content="GALANACCI THE CREATOR">');
  expect(html).toContain(`<meta property="og:description" content="${expectedDescription}">`);
  expect(html).toContain('<meta property="og:url" content="https://galanacci.com/">');
  expect(html).toContain('<meta property="og:image" content="https://galanacci.com/assets/share/home.png">');
  expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  expect(html).toContain('<meta name="twitter:image" content="https://galanacci.com/assets/share/home.png">');

  const image = await request.get("/assets/share/home.png");
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toContain("image/png");
  const bytes = await image.body();
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
});
