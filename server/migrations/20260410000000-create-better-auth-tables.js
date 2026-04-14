"use strict";

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // ba_user
      await queryInterface.createTable(
        "ba_user",
        {
          id: {
            type: Sequelize.STRING(36),
            primaryKey: true,
            allowNull: false,
          },
          name: {
            type: Sequelize.STRING(255),
            allowNull: false,
          },
          email: {
            type: Sequelize.STRING(255),
            allowNull: false,
            unique: true,
          },
          emailVerified: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          image: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          outlineUserId: {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
              model: "users",
              key: "id",
            },
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
        },
        { transaction }
      );

      // ba_session
      await queryInterface.createTable(
        "ba_session",
        {
          id: {
            type: Sequelize.STRING(36),
            primaryKey: true,
            allowNull: false,
          },
          userId: {
            type: Sequelize.STRING(36),
            allowNull: false,
            references: {
              model: "ba_user",
              key: "id",
            },
            onDelete: "CASCADE",
          },
          token: {
            type: Sequelize.STRING(255),
            allowNull: false,
            unique: true,
          },
          expiresAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          ipAddress: {
            type: Sequelize.STRING(45),
            allowNull: true,
          },
          userAgent: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          outlineUserId: {
            type: Sequelize.UUID,
            allowNull: true,
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
        },
        { transaction }
      );

      // ba_account
      await queryInterface.createTable(
        "ba_account",
        {
          id: {
            type: Sequelize.STRING(36),
            primaryKey: true,
            allowNull: false,
          },
          userId: {
            type: Sequelize.STRING(36),
            allowNull: false,
            references: {
              model: "ba_user",
              key: "id",
            },
            onDelete: "CASCADE",
          },
          accountId: {
            type: Sequelize.STRING(255),
            allowNull: false,
          },
          providerId: {
            type: Sequelize.STRING(255),
            allowNull: false,
          },
          accessToken: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          refreshToken: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          accessTokenExpiresAt: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          refreshTokenExpiresAt: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          scope: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          idToken: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          password: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
        },
        { transaction }
      );

      // ba_verification
      await queryInterface.createTable(
        "ba_verification",
        {
          id: {
            type: Sequelize.STRING(36),
            primaryKey: true,
            allowNull: false,
          },
          identifier: {
            type: Sequelize.STRING(255),
            allowNull: false,
          },
          value: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          expiresAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
          },
        },
        { transaction }
      );

      // Indexes
      await queryInterface.addIndex("ba_session", ["userId"], { transaction });
      await queryInterface.addIndex("ba_session", ["token"], {
        unique: true,
        transaction,
      });
      await queryInterface.addIndex("ba_account", ["userId"], { transaction });
      await queryInterface.addIndex("ba_account", ["providerId", "accountId"], {
        transaction,
      });
      await queryInterface.addIndex("ba_user", ["email"], {
        unique: true,
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("ba_verification", { transaction });
      await queryInterface.dropTable("ba_account", { transaction });
      await queryInterface.dropTable("ba_session", { transaction });
      await queryInterface.dropTable("ba_user", { transaction });
    });
  },
};
