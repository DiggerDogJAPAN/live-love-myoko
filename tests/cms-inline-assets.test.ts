import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inlineCmsImages, staticCmsHtml } from '../src/lib/cms-inline-assets.mjs';

const cms = 'http://localhost:8057';
const asset = '/assets/11111111-2222-3333-4444-555555555555.jpeg';
test('CMS description images export with matching deterministic static paths and retain surrounding copy', () => {
    const html = `<p>Property overview</p><p><img src="${cms}${asset}?width=1600&amp;height=1122" alt="Property Location"></p>`;
    const [image] = inlineCmsImages(html, cms);
    assert.equal(image.url, `${cms}${asset}?width=1600&height=1122`);
    assert.match(image.publicPath, /^\/images\/cms-inline\/[a-f0-9]{24}\.jpeg$/);
    assert.equal(staticCmsHtml(html, cms), `<p>Property overview</p><p><img src="${image.publicPath}" alt="Property Location"></p>`);
    assert.equal(inlineCmsImages(html, cms)[0].publicPath, image.publicPath);
    assert.notEqual(inlineCmsImages(html.replace('1600', '800'), cms)[0].publicPath, image.publicPath);
    const relative = `<img src='${asset}'>`;
    assert(staticCmsHtml(relative, cms).includes(inlineCmsImages(relative, cms)[0].publicPath));
});
test('External URLs, credentials, unrelated images and CMS links are left intact', () => {
    for (const html of [
        `<img src="https://external.example${asset}">`,
        `<img src="http://user:password@localhost:8057${asset}">`,
        '<img src="/images/existing.jpg">',
        `<a href="${cms}${asset}">Original link</a>`,
        '<img src="data:image/png;base64,aGVsbG8=">',
    ]) {
        assert.equal(inlineCmsImages(html, cms).length, 0);
        assert.equal(staticCmsHtml(html, cms), html);
    }
});
