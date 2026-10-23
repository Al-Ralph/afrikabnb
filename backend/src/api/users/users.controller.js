import bcrypt from "bcryptjs";
import prisma from "../../config/db.js";
import { SALT_ROUNDS } from "../auth/auth.controller.js";
import { revokeAllForUser, startSession } from "../auth/session.js";

export async function getProfile(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, avatar: true, role: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const { name, avatar, currentPassword, newPassword } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (avatar !== undefined) data.avatar = avatar;
    if (newPassword !== undefined) {
      const current = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { password: true },
      });
      if (!current || !(await bcrypt.compare(currentPassword, current.password))) {
        return res.status(401).json({ error: "Mot de passe actuel incorrect" });
      }
      data.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
      // Révoque les autres sessions : JWT émis avant cet instant (comparaison à la seconde) et
      // jetons de renouvellement (ci-dessous).
      data.passwordChangedAt = new Date();
    }
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, email: true, name: true, avatar: true, role: true },
    });
    if (!data.passwordChangedAt) return res.json(user);
    // Tous les jetons de renouvellement sont révoqués, puis une nouvelle session est ouverte pour
    // l'appareil courant (nouveau cookie + jeton d'accès émis après passwordChangedAt).
    await revokeAllForUser(prisma, user.id, data.passwordChangedAt);
    const token = await startSession(req, res, user.id);
    res.json({ ...user, token });
  } catch (err) {
    next(err);
  }
}
