import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app.js';
import {
  CATALOGS,
  DEFAULT_AVATAR_KEY,
} from '../../server/modules/identity/catalogs.js';
import { toPartnerDto, toSelfDto } from '../../server/modules/identity/dto.js';
import { updateUserProfile } from '../../server/modules/identity/identity-service.js';
import {
  validateIdempotencyKey,
  validateProfileUpdateInput,
} from '../../server/modules/identity/validation.js';

describe('BE-002 Profile & Catalogs unit and HTTP contract tests', () => {
  const app = createApp({ checkHealth: async () => {} });

  describe('GET /api/v1/catalogs (Public)', () => {
    it('returns 200 with all 9 catalog groups, {code, label} items, and includes the default registration avatar', async () => {
      const res = await request(app).get('/api/v1/catalogs').expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(res.body.meta).toHaveProperty('requestId');
      expect(res.body.meta).toHaveProperty('serverTime');

      /** @type {Record<string, Array<{ code: string | number; label: string }>>} */
      const data = res.body.data;
      const expectedGroups = [
        'levels',
        'durations',
        'goals',
        'interests',
        'languages',
        'countries',
        'ageGroups',
        'genders',
        'avatars',
      ];
      expect(Object.keys(data)).toEqual(expectedGroups);

      for (const group of expectedGroups) {
        expect(Array.isArray(data[group])).toBe(true);
        expect(data[group].length).toBeGreaterThan(0);
        for (const item of data[group]) {
          expect(Object.keys(item)).toEqual(['code', 'label']);
          expect(typeof item.label).toBe('string');
          expect(item.label.trim().length).toBeGreaterThan(0);
        }
      }

      expect(data.levels.map((x) => x.code)).toEqual([
        'N5',
        'N4',
        'N3',
        'N2',
        'N1',
      ]);
      expect(data.durations.map((x) => x.code)).toEqual([10, 20, 30]);
      expect(data.goals.map((x) => x.code)).toEqual([
        'dailyCommunication',
        'travel',
        'studyAndWork',
        'examPreparation',
        'culturalExchange',
      ]);
      expect(data.interests.map((x) => x.code)).toEqual([
        'music',
        'filmAndAnime',
        'food',
        'travel',
        'books',
        'games',
        'sports',
        'technology',
      ]);
      expect(data.ageGroups.map((x) => x.code)).toEqual([
        'under18',
        '18to22',
        '23to30',
        'over30',
      ]);
      expect(data.genders.map((x) => x.code)).toEqual([
        'male',
        'female',
        'other',
      ]);

      const avatarCodes = data.avatars.map((x) => x.code);
      expect(avatarCodes).toContain(DEFAULT_AVATAR_KEY);
    });
  });

  describe('validateIdempotencyKey & updateUserProfile runtime key guard', () => {
    it('accepts valid UUIDs across RFC versions (v1, v4, v7) and normalizes to lowercase', () => {
      // v1 UUID
      expect(
        validateIdempotencyKey('6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
      ).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
      // v4 UUID (uppercase)
      expect(
        validateIdempotencyKey('550E8400-E29B-41D4-A716-446655440000'),
      ).toBe('550e8400-e29b-41d4-a716-446655440000');
      // v7 UUID
      expect(
        validateIdempotencyKey('018f4a7c-8d32-7000-8000-000000000001'),
      ).toBe('018f4a7c-8d32-7000-8000-000000000001');
    });

    it.each([
      undefined,
      null,
      '',
      '   ',
      'not-a-uuid',
      '550e8400-e29b-01d4-a716-446655440000',
      '550e8400-e29b-41d4-c716-446655440000',
      ' 550e8400-e29b-41d4-a716-446655440000 ',
    ])(
      'rejects invalid Idempotency-Key (%s) in both validateIdempotencyKey and direct updateUserProfile calls with 422 INVALID_UUID',
      async (invalidKey) => {
        try {
          validateIdempotencyKey(invalidKey);
          expect.fail('Expected validateIdempotencyKey to throw 422');
        } catch (err) {
          const appErr = /** @type {any} */ (err);
          expect(appErr.status).toBe(422);
          expect(appErr.code).toBe('VALIDATION_FAILED');
          expect(appErr.details.fields).toEqual([
            expect.objectContaining({
              path: 'Idempotency-Key',
              code: 'INVALID_UUID',
            }),
          ]);
        }

        await expect(
          updateUserProfile({
            userId: '507f1f77bcf86cd799439011',
            rawBody: { expectedVersion: 0, displayName: 'Hạnh Nhi' },
            idempotencyKey: /** @type {any} */ (invalidKey),
          }),
        ).rejects.toMatchObject({
          status: 422,
          code: 'VALIDATION_FAILED',
          details: {
            fields: [
              expect.objectContaining({
                path: 'Idempotency-Key',
                code: 'INVALID_UUID',
              }),
            ],
          },
        });
      },
    );
  });

  describe('validateProfileUpdateInput unit validation', () => {
    it('accepts partial updates, Unicode displayName up to 100 code points, and null on optional profile fields', () => {
      const hundredEmoji = '🌸'.repeat(100);
      const parsed = validateProfileUpdateInput({
        expectedVersion: 0,
        displayName: `  ${hundredEmoji}  `,
        avatarKey: 'hachiware',
        profile: {
          level: 'N3',
          goal: null,
          interests: ['music', 'games', 'technology'],
          nativeLanguageCode: 'vi',
          countryCode: 'VN',
          ageGroup: '18to22',
          gender: null,
        },
      });

      expect(parsed).toEqual({
        expectedVersion: 0,
        displayName: hundredEmoji,
        avatarKey: 'hachiware',
        profileUpdates: {
          level: 'N3',
          goal: null,
          interests: ['music', 'games', 'technology'],
          nativeLanguageCode: 'vi',
          countryCode: 'VN',
          ageGroup: '18to22',
          gender: null,
        },
      });
    });

    it('distinguishes omitted fields from null and rejects null on required fields', () => {
      const onlyGoal = validateProfileUpdateInput({
        expectedVersion: 2,
        profile: {
          goal: 'travel',
        },
      });
      expect(onlyGoal).toEqual({
        expectedVersion: 2,
        profileUpdates: {
          goal: 'travel',
        },
      });
      expect(onlyGoal.displayName).toBeUndefined();
      expect(onlyGoal.avatarKey).toBeUndefined();
      expect(Object.keys(onlyGoal.profileUpdates)).toEqual(['goal']);

      for (const invalidPayload of [
        { expectedVersion: null, displayName: 'Nhi' },
        { expectedVersion: 0, displayName: null },
        { expectedVersion: 0, avatarKey: null },
        { expectedVersion: 0, profile: null },
        { expectedVersion: 0, profile: { interests: null } },
      ]) {
        expect(() => validateProfileUpdateInput(invalidPayload)).toThrow();
      }
    });

    it('rejects >3 interests, duplicate interests, multiple goals, invalid enums, and unknown/privileged fields', () => {
      // > 3 interests
      try {
        validateProfileUpdateInput({
          expectedVersion: 0,
          profile: {
            interests: ['music', 'food', 'travel', 'books'],
          },
        });
        expect.fail('Should reject > 3 interests');
      } catch (err) {
        const appErr = /** @type {any} */ (err);
        expect(appErr.status).toBe(422);
        expect(appErr.details.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'profile.interests',
              code: 'MAX_ITEMS_EXCEEDED',
            }),
          ]),
        );
      }

      // Duplicate interests
      try {
        validateProfileUpdateInput({
          expectedVersion: 0,
          profile: {
            interests: ['music', 'music'],
          },
        });
        expect.fail('Should reject duplicate interests');
      } catch (err) {
        const appErr = /** @type {any} */ (err);
        expect(appErr.status).toBe(422);
        expect(appErr.details.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'profile.interests',
              code: 'DUPLICATE_ITEM',
            }),
          ]),
        );
      }

      // Multiple goals passed as array
      try {
        validateProfileUpdateInput({
          expectedVersion: 0,
          profile: {
            goal: ['travel', 'studyAndWork'],
          },
        });
        expect.fail('Should reject array for goal');
      } catch (err) {
        const appErr = /** @type {any} */ (err);
        expect(appErr.status).toBe(422);
        expect(appErr.details.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: 'profile.goal',
              code: 'INVALID_TYPE',
            }),
          ]),
        );
      }

      // Unknown / privileged fields
      try {
        validateProfileUpdateInput({
          expectedVersion: 0,
          role: 'admin',
          status: 'active',
          authVersion: 99,
          userId: '507f1f77bcf86cd799439011',
          profile: {
            level: 'N5',
            extraField: 'not-allowed',
          },
        });
        expect.fail('Should reject unknown fields');
      } catch (err) {
        const appErr = /** @type {any} */ (err);
        expect(appErr.status).toBe(422);
        expect(appErr.details.fields).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ path: 'role', code: 'UNKNOWN_FIELD' }),
            expect.objectContaining({ path: 'status', code: 'UNKNOWN_FIELD' }),
            expect.objectContaining({
              path: 'authVersion',
              code: 'UNKNOWN_FIELD',
            }),
            expect.objectContaining({ path: 'userId', code: 'UNKNOWN_FIELD' }),
            expect.objectContaining({
              path: 'profile.extraField',
              code: 'UNKNOWN_FIELD',
            }),
          ]),
        );
      }
    });
  });

  describe('Self and Partner DTO projection consistency with catalogs', () => {
    it('projects Self and Partner DTOs using catalog codes while Partner DTO never exposes email, passwordHash, or session metadata', () => {
      const userDoc = {
        _id: '507f1f77bcf86cd799439011',
        email: 'private@example.com',
        emailKey: 'private@example.com',
        passwordHash: 'scrypt$16384$8$1$salt$hash',
        role: 'learner',
        status: 'active',
        authVersion: 2,
        version: 4,
        displayName: 'Hạnh Nhi',
        avatarKey: CATALOGS.avatars[1].code,
        profile: {
          level: 'N3',
          nativeLanguageCode: 'vi',
          goal: 'dailyCommunication',
          interests: ['music', 'filmAndAnime'],
          countryCode: 'VN',
          ageGroup: '18to22',
          gender: 'female',
        },
      };

      const selfDto = toSelfDto(userDoc);
      expect(selfDto.email).toBe('private@example.com');
      expect(selfDto.version).toBe(4);
      expect(selfDto.profile).toEqual({
        level: 'N3',
        nativeLanguageCode: 'vi',
        goal: 'dailyCommunication',
        interests: ['music', 'filmAndAnime'],
        countryCode: 'VN',
        ageGroup: '18to22',
        gender: 'female',
      });

      const partnerDto = toPartnerDto(userDoc);
      expect(partnerDto).toEqual({
        actorKey: 'user:507f1f77bcf86cd799439011',
        displayName: 'Hạnh Nhi',
        avatarKey: 'hachiware',
        profile: {
          level: 'N3',
          nativeLanguageCode: 'vi',
          goal: 'dailyCommunication',
          interests: ['music', 'filmAndAnime'],
          countryCode: 'VN',
          ageGroup: '18to22',
          gender: 'female',
        },
      });
      expect(partnerDto).not.toHaveProperty('email');
      expect(partnerDto).not.toHaveProperty('emailKey');
      expect(partnerDto).not.toHaveProperty('passwordHash');
      expect(partnerDto).not.toHaveProperty('authVersion');
      expect(partnerDto).not.toHaveProperty('role');
      expect(partnerDto).not.toHaveProperty('status');
      expect(partnerDto).not.toHaveProperty('version');
      expect(JSON.stringify(partnerDto)).not.toContain('private@example.com');
    });
  });
});
