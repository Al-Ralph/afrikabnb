import bcrypt from "bcryptjs";
import prisma from "../../config/db.js";
import { SALT_ROUNDS } from "../auth/auth.controller.js";
import { signToken } from "../../config/jwt.js";

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
      // Révoque les autres sessions (JWT émis avant cet instant, comparaison à la seconde).
      data.passwordChangedAt = new Date();
    }
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, email: true, name: true, avatar: true, role: true },
    });
    // Nouveau jeton émis après passwordChangedAt (iat >= sa seconde) : la session courante reste valide.
    res.json(data.passwordChangedAt ? { ...user, token: signToken(user.id) } : user);
  } catch (err) {
    next(err);
  }
}
