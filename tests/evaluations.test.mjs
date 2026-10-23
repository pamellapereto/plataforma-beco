import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError } from '../backedb/src/lib/http.js';
import { EvaluationsService } from '../backedb/src/modules/evaluations/evaluations.service.js';
import { validateAttendance, validateEvaluation } from '../backedb/src/modules/evaluations/evaluations.validation.js';

const applicationId = '11111111-1111-4111-8111-111111111111';
const editionId = '22222222-2222-4222-8222-222222222222';
const fairId = '33333333-3333-4333-8333-333333333333';
const organizationId = '44444444-4444-4444-8444-444444444444';

test('validation accepts integer ratings and optional sales', () => {
  assert.deepEqual(validateAttendance({ attended: true, note: 'Compareceu' }), { attended: true, note: 'Compareceu' });
  assert.equal(validateEvaluation({
    organizationCommunicationRating: 5,
    structureRating: 4,
    publicityRating: 3,
    audienceRating: 2,
    overallRating: 5,
    salesRating: '',
    comments: 'Bom evento'
  }).salesRating, null);
});

test('validation rejects fractional and out-of-range ratings', () => {
  for (const invalid of [0, 6, 4.5, '5']) {
    assert.throws(() => validateEvaluation({
      organizationCommunicationRating: invalid,
      structureRating: 4,
      publicityRating: 4,
      audienceRating: 4,
      overallRating: 4
    }), (error) => error instanceof HttpError && error.code === 'INVALID_RATING');
  }
});

test('public event averages stay hidden until three responses', async () => {
  let responseCount = 2;
  const gateway = { request: async (path) => {
    if (path.startsWith('rest/v1/fair_editions?')) return [{ id: editionId, fair_id: fairId, title: 'Feira', status: 'FINISHED' }];
    if (path.startsWith('rest/v1/fairs?')) return [{ id: fairId, organization_id: organizationId, is_active: true }];
    if (path.startsWith('rest/v1/applications?')) return Array.from({ length: responseCount }, (_, index) => ({ id: `${index + 1}`.padStart(8, '0') + '-1111-4111-8111-111111111111' }));
    if (path.startsWith('rest/v1/event_evaluations?')) return Array.from({ length: responseCount }, (_, index) => ({
      application_id: `${index + 1}`.padStart(8, '0') + '-1111-4111-8111-111111111111',
      organization_communication_rating: 5,
      structure_rating: 4,
      publicity_rating: 3,
      audience_rating: 4,
      overall_rating: 5,
      sales_rating: index === 0 ? 5 : null
    }));
    throw new Error(`Unexpected request: ${path}`);
  }};
  const service = new EvaluationsService(gateway, {});
  const privateSummary = await service.publicEditionSummary('feira');
  assert.equal(privateSummary.metrics.overall.average, null);
  assert.equal(privateSummary.metrics.overall.responses, 2);
  responseCount = 3;
  const publicSummary = await service.publicEditionSummary('feira');
  assert.equal(publicSummary.metrics.overall.average, 5);
  assert.equal(publicSummary.metrics.overall.responses, 3);
  assert.equal(publicSummary.metrics.sales.average, null);
});

test('exhibitor cannot evaluate without confirmed attendance', async () => {
  const gateway = { request: async (path) => {
    if (path.includes('exhibitors?')) return [{ id: '55555555-5555-4555-8555-555555555555' }];
    if (path.includes('applications?')) return [{ id: applicationId, fair_edition_id: editionId, exhibitor_id: '55555555-5555-4555-8555-555555555555', status: 'CONFIRMED' }];
    if (path.includes('fair_editions?')) return [{ id: editionId, ends_at: '2020-01-01T00:00:00Z', status: 'FINISHED' }];
    if (path.includes('application_attendance?')) return [];
    throw new Error(`Unexpected request: ${path}`);
  }};
  const service = new EvaluationsService(gateway, {});
  await assert.rejects(() => service.submit(applicationId, {}, { id: 'user', role: 'EXHIBITOR' }), (error) => error instanceof HttpError && error.code === 'EVALUATION_NOT_ALLOWED');
});
