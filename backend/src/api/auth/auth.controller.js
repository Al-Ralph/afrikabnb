import bcrypt from "bcryptjs";
import prisma from "../../config/db.js";
import { signToken } from "../../config/jwt.js";

export const SALT_ROUNDS = 12;
// Hash factice : compare() prend le même temps que l'utilisateur existe ou non (anti-timing).
const DUMMY_HASH = bcrypt.hashSync("afrikabnb-timing-dummy", SALT_ROUNDS);

const publicUser = { id: true, email: true, name: true, avatar: true, role: true };

export async function register(req, res, next) {
  try {
    const { email, password, name } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Cet email est déjà utilisé" });
    }
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, password: hashed, name: name || null },
      select: publicUser,
    });
    const token = signToken(user.id);
    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
    if (!user || !valid) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }
    const token = signToken(user.id);
    const { password: _, ...safe } = user;
    res.json({ user: safe, token });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    res.json({ user: req.user });
  } catch (err) {
    next(err);
  }
}
