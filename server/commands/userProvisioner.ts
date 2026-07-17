import type { InferCreationAttributes, Transaction } from "sequelize";
import { Op } from "sequelize";
import type { UserRole } from "@shared/types";
import InviteAcceptedEmail from "@server/emails/templates/InviteAcceptedEmail";
import {
  DomainNotAllowedError,
  InternalError,
  InvalidAuthenticationError,
  InviteRequiredError,
} from "@server/errors";
import Logger from "@server/logging/Logger";
import { Team, User, UserAuthentication } from "@server/models";
import { sequelize } from "@server/storage/database";
import type { APIContext } from "@server/types";
import { UserFlag } from "@server/models/User";
import UploadUserAvatarTask from "@server/queues/tasks/UploadUserAvatarTask";

type UserProvisionerResult = {
  user: User;
  isNewUser: boolean;
  authentication: UserAuthentication | null;
};

type Props = {
  /** The displayed name of the user */
  name: string;
  /** The email address of the user */
  email: string;
  /** The language of the user, if known */
  language?: string;
  /** The role for new user, Member if none is provided */
  role?: UserRole;
  /** The public url of an image representing the user */
  avatarUrl?: string | null;
  /**
   * The internal ID of the team that is being logged into based on the
   * subdomain that the request came from, if any.
   */
  teamId: string;
  /** Bundle of props related to the current external provider authentication */
  authentication?: {
    authenticationProviderId: string;
    /** External identifier of the user in the authentication provider  */
    providerId: string | number;
    /** The scopes granted by the access token */
    scopes: string[];
    /** The token provided by the authentication provider */
    accessToken?: string;
    /** The refresh token provided by the authentication provider */
    refreshToken?: string;
    /** The timestamp when the access token expires */
    expiresAt?: Date;
  };
};

export default async function userProvisioner(
  ctx: APIContext,
  { name, email, role, language, avatarUrl, teamId, authentication }: Props
): Promise<UserProvisionerResult> {
  const auth = authentication
    ? await UserAuthentication.findOne({
        where: {
          providerId: String(authentication.providerId),
        },
        include: [
          {
            model: User,
            as: "user",
            where: { teamId },
            required: true,
          },
        ],
      })
    : undefined;

  // Someone has signed in with this authentication before, we just
  // want to update the details instead of creating a new record
  if (auth && authentication) {
    const { providerId, authenticationProviderId, ...rest } = authentication;
    const { user } = auth;

    // We found an authentication record that matches the user id, but it's
    // associated with a different authentication provider, (eg a different
    // hosted google domain). This is possible in Google Auth when moving domains.
    // In the future we may auto-migrate these.
    if (auth.authenticationProviderId !== authenticationProviderId) {
      throw InternalError(
        `User authentication ${providerId} already exists for ${auth.authenticationProviderId}, tried to assign to ${authenticationProviderId}`
      );
    }

    if (user) {
      if (avatarUrl && !user.getFlag(UserFlag.AvatarUpdated)) {
        await new UploadUserAvatarTask().schedule({
          userId: user.id,
          avatarUrl,
        });
      }
      await user.update({ email });
      await auth.update(rest);

      return {
        user,
        authentication: auth,
        isNewUser: false,
      };
    }

    // We found an authentication record, but the associated user was deleted or
    // otherwise didn't exist. Cleanup the auth record and proceed with creating
    // a new user. See: https://github.com/outline/outline/issues/2022
    await auth.destroy();
  }

  // A `user` record may exist even if there is no existing authentication record.
  // This is either an invite or a user that's external to the team
  const existingUser = await User.scope([
    "withAuthentications",
    "withTeam",
  ]).findOne({
    where: {
      // Email from auth providers may be capitalized
      email: {
        [Op.iLike]: email,
      },
      teamId,
    },
  });

  const team = await Team.scope("withDomains").findByPk(teamId, {
    attributes: ["defaultUserRole", "inviteRequired", "id"],
  });

  // We have an existing user, so we need to update it with our
  // new details and count this as a new user creation.
  if (existingUser) {
    // A `user` record might exist in the form of an invite.
    // An invite is a shell user record with no authentication method
    // that's never been active before.
    const isInvite = existingUser.isInvited;

    const associate = async (transaction: Transaction) => {
      // Regardless, create a new authentication record
      // against the existing user (user can auth with multiple SSO providers)
      // Update user's name and avatar based on the most recently added provider
      await existingUser.update(
        {
          name,
          avatarUrl,
          lastActiveAt: new Date(),
          lastActiveIp: ctx.ip,
        },
        {
          transaction,
        }
      );

      // Only need to associate the authentication with the user if there is one.
      if (!authentication) {
        return null;
      }

      return await existingUser.$create<UserAuthentication>(
        "authentication",
        authentication,
        {
          transaction,
        }
      );
    };

    // Join the caller's transaction when present so a rollback also undoes
    // the invite acceptance (lastActiveAt flips `isInvited`) — otherwise a
    // failed sign-in would consume the invite while the emails deferred to
    // that transaction's commit are dropped and can never be sent again.
    const userAuth = ctx.state.transaction
      ? await associate(ctx.state.transaction)
      : await sequelize.transaction(associate);

    if (isInvite) {
      const inviter = await existingUser.$get("invitedBy");
      if (inviter) {
        const inviteAcceptedEmail = new InviteAcceptedEmail({
          to: inviter.email,
          inviterId: inviter.id,
          invitedName: existingUser.name,
          teamUrl: existingUser.team.url,
        });

        // The queue is not transaction-aware — only enqueue once the sign-in
        // is durably committed, otherwise a rollback still sends the email.
        if (ctx.state.transaction) {
          ctx.state.transaction.afterCommit(
            () => void inviteAcceptedEmail.schedule()
          );
        } else {
          await inviteAcceptedEmail.schedule();
        }
      }
    }

    return {
      user: existingUser,
      authentication: userAuth,
      isNewUser: isInvite,
    };
  } else if (!authentication && !team?.allowedDomains.length) {
    // There's no existing invite or user that matches the external auth email
    // and there is no possibility of matching an allowed domain.
    throw InvalidAuthenticationError(
      "No matching user for email or allowed domain"
    );
  }

  //
  // No auth, no user – this is an entirely new sign in.
  //

  // If the team settings are set to require invites, and there's no existing user record,
  // throw an error and fail user creation.
  if (team?.inviteRequired) {
    Logger.info("authentication", "Sign in without invitation", {
      teamId: team.id,
      email,
    });
    throw InviteRequiredError();
  }

  // If the team settings do not allow this domain,
  // throw an error and fail user creation.
  if (team && !(await team.isDomainAllowed(email))) {
    throw DomainNotAllowedError();
  }

  // The create runs on the caller's transaction from ctx (createWithCtx reads
  // ctx.context.transaction) — a transaction opened here would never be used
  // by the insert and would only hold a second pool connection.
  const user = await User.createWithCtx(
    ctx,
    {
      name,
      email,
      language,
      role: role ?? team?.defaultUserRole,
      teamId,
      avatarUrl,
      authentications: authentication ? [authentication] : [],
      lastActiveAt: new Date(),
      lastActiveIp: ctx.ip,
    } as Partial<InferCreationAttributes<User>>,
    undefined,
    {
      include: "authentications",
    }
  );

  return {
    user,
    authentication: user.authentications[0],
    isNewUser: true,
  };
}
