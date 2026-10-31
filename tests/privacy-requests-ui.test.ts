import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createRequire } from 'node:module';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseRequests, parseAdminRequests, type AdminPrivacyRequest } from '../src/lib/privacy/requests';

let Requests: ComponentType<{ administrator: boolean }>, Case: ComponentType<{ row: AdminPrivacyRequest; onUpdated: () => Promise<void> }>;
let Accordion: ComponentType<{ id: string; title: string; description: string; status?: 'pending' | 'in_progress'; children?: ReactNode }>;
before(async () => {
    const require = createRequire(`${process.cwd()}/package.json`);
    require.extensions['.css'] = module => { module.exports = {}; };
    const requestsModule = await import('../src/components/privacy/PrivacyRequests');
    Requests = requestsModule.default;
    Accordion = requestsModule.PrivacyAccordion;
    Case = (await import('../src/components/privacy/PrivacyRequestsAdmin')).AdminCase;
});
const own = { id: '00000000-0000-4000-8000-000000000001', type: 'deletion' as const, scope: 'account' as const,
    details: '<script>do-not-execute</script>', status: 'in_progress' as const, submittedAt: '2026-10-31T00:00:00Z',
    updatedAt: '2026-10-31T00:00:00Z', completedAt: null, response: '' };
test('Customer interface uses labelled controls and a native confirmation dialog without showing administrator management', () => {
    const html = renderToStaticMarkup(createElement(Requests, { administrator: false }));
    for (const text of ['Privacy &amp; Data Requests', 'Account Deletion', 'Request Account Deletion', 'Confirm Deletion Request', 'Keep My Account', 'not immediately delete', 'maxLength="2000"']) assert(html.includes(text), text);
    assert(html.includes('<dialog')); assert(!html.includes('Privacy Requests — Administrator'));
    assert(!html.includes('Delete Verified Account')); assert(html.includes('disabled=""'));
    for (const label of html.matchAll(/<label[^>]*for="([^"]+)"/g)) assert(html.includes(`id="${label[1]}"`));
});
test('Privacy sections start independently collapsed with accessible heading buttons and mounted, hidden forms', () => {
    const html = renderToStaticMarkup(createElement(Requests, { administrator: false }));
    assert.equal([...html.matchAll(/aria-expanded="false"/g)].length, 2);
    for (const id of ['privacy-requests', 'account-deletion']) {
        assert(html.includes(`aria-controls="${id}-content"`));
        assert(html.includes(`aria-labelledby="${id}-heading" aria-describedby="${id}-description"`));
        assert(html.includes(`id="${id}-content" hidden=""`));
        assert(html.includes(`id="${id}-heading"`));
    }
    assert.equal([...html.matchAll(/<svg[^>]*aria-hidden="true"/g)].length, 2);
    assert(html.includes('id="privacy-type"')); assert(html.includes('<dialog'));
});
test('Collapsed headings expose pending/in-progress status descriptions without revealing private request details', () => {
    for (const status of ['pending', 'in_progress'] as const) {
        const html = renderToStaticMarkup(createElement(Accordion, { id: 'sample', title: 'Privacy requests', description: 'Manage your information.', status },
            createElement('form', null, 'Private form content')));
        const heading = html.slice(0, html.indexOf('</h2>'));
        assert(heading.includes('aria-expanded="false"'));
        assert(heading.includes('aria-describedby="sample-description sample-status"'));
        assert(heading.includes('role="status"'));
        assert(heading.includes(status === 'pending' ? 'Request pending' : 'In progress'));
        assert(!heading.includes('Private form content'));
        assert(html.includes('id="sample-content" hidden=""'));
    }
});
test('Only the administrator view offers review/export/deletion controls, with exact-target confirmation and escaped details', () => {
    assert(renderToStaticMarkup(createElement(Requests, { administrator: true })).includes('Privacy Requests — Administrator'));
    const row: AdminPrivacyRequest = { ...own, userId: '00000000-0000-4000-8000-000000000002', adminNotes: 'Reviewed', identityVerifiedAt: own.submittedAt,
        retentionReviewedAt: own.submittedAt, legalHold: false, accountDeletedAt: null };
    const html = renderToStaticMarkup(createElement(Case, { row, onUpdated: async () => {} }));
    assert(html.includes('Download Individual JSON Export')); assert(html.includes('Delete Verified Account'));
    assert(html.includes(`DELETE ${row.userId} FOR ${row.id}`)); assert(html.includes('disabled=""'), 'empty typed confirmation disables deletion');
    assert(!html.includes('<script>')); assert(html.includes('&lt;script&gt;'));
});
test('Customer projection discards administrator fields and rejects malformed request/status/scope payloads', () => {
    const rows = parseRequests({ requests: [{ ...own, admin_notes: 'SECRET', userId: 'OTHER' }] });
    assert(!JSON.stringify(rows).includes('SECRET')); assert(!JSON.stringify(rows).includes('OTHER'));
    for (const patch of [{ status: 'administrator' }, { scope: 'all_users' }, { submittedAt: 'invalid' }, { details: 'x'.repeat(2001) }]) {
        assert.throws(() => parseRequests({ requests: [{ ...own, ...patch }] }));
    }
    assert.throws(() => parseAdminRequests({ requests: [own] }));
});
