import { subMinutes } from "date-fns";
import JWT from "jsonwebtoken";
import type { FindOptions } from "sequelize";
import { Team, User } from "@server/models";
import { AuthenticationError, UserSuspendedError } from "../errors";

export function getJWTPayload(token: string) {
  let payload;
  if (!token) {
    throw AuthenticationError("Missing token");
  }

  try {
    payload = JWT.decode(token);

    if (!payload) {
      throw AuthenticationError("Invalid token");
    }

    return payload as JWT.JwtPayload;
  } catch (_err) {
    throw AuthenticationError("Unable to decode token");
  }
}

/**
 * Validates a collaboration JWT token and returns the associated user.
 * Only accepts tokens with type "collaboration".
 */
export async function getUserForCollaborationToken(
  token: string
): Promise<User> {
  const payload = getJWTPayload(token);

  if (payload.type !== "collaboration") {
    throw AuthenticationError("Invalid token");
  }

  if (payload.expiresAt) {
    if (new Date(payload.expiresAt) < new Date()) {
      throw AuthenticationError("Expired token");
    }
  }

  const user = await User.findByPk(payload.id, {
    include: [
      {
        model: Team,
        as: "team",
        required: true,
      },
    ],
  });

  if (!user) {
    throw AuthenticationError("Invalid token");
  }

  if (user.isSuspended) {
    const suspendingAdmin = user.suspendedById
      ? await User.findByPk(user.suspendedById)
      : undefined;
    throw UserSuspendedError({
      adminEmail: suspendingAdmin?.email || undefined,
    });
  }

  try {
    JWT.verify(token, user.jwtSecret);
  } catch (_err) {
    throw AuthenticationError("Invalid token");
  }

  return user;
}

export async function getDetailsForEmailUpdateToken(
  token: string,
  options: FindOptions<User> = {}
): Promise<{ user: User; email: string }> {
  const payload = getJWTPayload(token);

  if (payload.type !== "email-update") {
    throw AuthenticationError("Invalid token");
  }

  // check the token is within it's expiration time
  if (payload.createdAt) {
    if (new Date(payload.createdAt) < subMinutes(new Date(), 10)) {
      throw AuthenticationError("Expired token");
    }
  }

  const email = payload.email;
  const user = await User.findByPk(payload.id, {
    rejectOnEmpty: true,
    ...options,
  });

  try {
    JWT.verify(token, user.jwtSecret);
  } catch (_err) {
    throw AuthenticationError("Invalid token");
  }

  return { user, email };
}
