'use strict';

const prisma = require('../lib/prisma');

/**
 * Гард для роутов /api/profiles/:id и /api/people/:id.
 *
 * Логика:
 *  - actor === ADMIN     → всегда
 *  - actor === owner     → всегда
 *  - mode === 'view':
 *      Visibility.PUBLIC      → всем
 *      Visibility.UNLISTED    → всем (только по прямой ссылке)
 *      Visibility.PASSWORD    → нужен JWT с accessHash или ProfileAccess
 *      Visibility.PRIVATE     → только owner / ADMIN / ProfileAccess (view)
 *  - mode === 'edit':
 *      только owner / ADMIN / ProfileAccess.canEdit === true
 *
 * Использование:
 *   router.get('/profiles/:id', requireProfileAccess('view'), handler)
 *   router.put('/profiles/:id', requireProfileAccess('edit'), handler)
 *
 * Кладёт в req.profile найденный профиль.
 */
function requireProfileAccess(mode = 'view') {
	if (mode !== 'view' && mode !== 'edit') {
		throw new Error(`requireProfileAccess: unknown mode "${mode}"`);
	}

	return async (req, res, next) => {
		try {
			const idOrSlug = req.params.id || req.params.personId || req.params.profileId;
			if (!idOrSlug) return res.status(400).json({ ok: false, error: 'no_profile_id' });

			const profile = await prisma.profile.findFirst({
				where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
				select: {
					id: true, slug: true, ownerId: true, visibility: true, accessHash: true,
				},
			});

			if (!profile) return res.status(404).json({ ok: false, error: 'profile_not_found' });

			req.profile = profile;
			const actor = req.user; // {id, role, ...} from middleware/auth

			// ADMIN — всегда
			if (actor && actor.role === 'ADMIN') return next();

			// Owner — всегда
			if (actor && profile.ownerId === actor.id) return next();

			if (mode === 'edit') {
				// Только владелец/ADMIN/ProfileAccess.canEdit
				if (!actor) return res.status(401).json({ ok: false, error: 'auth_required' });

				const access = await prisma.profileAccess.findUnique({
					where: { profileId_userId: { profileId: profile.id, userId: actor.id } },
					select: { canEdit: true },
				});
				if (access && access.canEdit) return next();

				return res.status(403).json({ ok: false, error: 'edit_forbidden' });
			}

			// mode === 'view'
			if (profile.visibility === 'PUBLIC' || profile.visibility === 'UNLISTED') {
				return next();
			}

			if (!actor) return res.status(401).json({ ok: false, error: 'auth_required' });

			if (profile.visibility === 'PASSWORD') {
				// Доступ через ProfileAccess или сессию с проверенным кодом
				const access = await prisma.profileAccess.findUnique({
					where: { profileId_userId: { profileId: profile.id, userId: actor.id } },
					select: { canEdit: true },
				});
				if (access) return next();

				// Юзер должен сначала /verify-code (это создаст ProfileAccess)
				return res.status(403).json({ ok: false, error: 'access_code_required' });
			}

			if (profile.visibility === 'PRIVATE') {
				const access = await prisma.profileAccess.findUnique({
					where: { profileId_userId: { profileId: profile.id, userId: actor.id } },
					select: { canEdit: true },
				});
				if (access) return next();

				return res.status(403).json({ ok: false, error: 'private_profile' });
			}

			return res.status(403).json({ ok: false, error: 'access_denied' });
		} catch (err) {
			next(err);
		}
	};
}

module.exports = { requireProfileAccess };