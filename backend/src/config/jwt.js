import jwt from "jsonwebtoken";
import { config } from "./env.js";

const ALGORITHM = "HS256";

export function signToken(userId) {
  return jwt.sign({ userId }, config.jwt.secret, {
    algorithm: ALGORITHM,
    expiresIn: config.jwt.expiresIn,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret, { algorithms: [ALGORITHM] });
}
