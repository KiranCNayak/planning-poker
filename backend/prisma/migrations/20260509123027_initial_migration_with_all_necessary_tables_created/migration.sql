-- CreateEnum
CREATE TYPE "RoomHistoryEventType" AS ENUM ('join', 'leave');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('vote_cast', 'reveal', 'hide', 'reset', 'join', 'leave', 'room_created', 'kick', 'ban');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(50),
    "email" VARCHAR(255),
    "password_hash" TEXT,
    "google_id" VARCHAR(255),
    "is_anonymous" BOOLEAN NOT NULL DEFAULT true,
    "anon_id" UUID,
    "room_create_limit" INTEGER NOT NULL DEFAULT 30,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "short_code" VARCHAR(36) NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(40),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "votes_revealed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_sessions" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "identity_key" VARCHAR(255) NOT NULL,
    "user_id" UUID,
    "display_name" VARCHAR(50) NOT NULL,
    "current_vote" VARCHAR(5),
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),

    CONSTRAINT "room_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_participant_history" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "identity_key" VARCHAR(255) NOT NULL,
    "user_id" UUID,
    "display_name" VARCHAR(50) NOT NULL,
    "event_type" "RoomHistoryEventType" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_participant_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "room_id" UUID,
    "user_id" UUID,
    "event_type" "AuditEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "username_reservations" (
    "username" VARCHAR(50) NOT NULL,
    "user_id" UUID NOT NULL,
    "claimed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "username_reservations_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "rate_limit_violations" (
    "id" BIGSERIAL NOT NULL,
    "identity_key" VARCHAR(255) NOT NULL,
    "endpoint" VARCHAR(100) NOT NULL,
    "violation_count" INTEGER NOT NULL DEFAULT 1,
    "first_seen" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "rate_limit_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_bans" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "identity_key" VARCHAR(255) NOT NULL,
    "banned_by_user_id" UUID NOT NULL,
    "reason" TEXT,
    "tier" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lifted_at" TIMESTAMPTZ(6),
    "lifted_by_user_id" UUID,

    CONSTRAINT "room_bans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_short_code_key" ON "rooms"("short_code");

-- CreateIndex
CREATE INDEX "room_sessions_room_id_left_at_idx" ON "room_sessions"("room_id", "left_at");

-- CreateIndex
CREATE UNIQUE INDEX "room_sessions_room_id_identity_key_key" ON "room_sessions"("room_id", "identity_key");

-- CreateIndex
CREATE INDEX "room_participant_history_room_id_created_at_idx" ON "room_participant_history"("room_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_room_id_created_at_idx" ON "audit_logs"("room_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "username_reservations_user_id_key" ON "username_reservations"("user_id");

-- CreateIndex
CREATE INDEX "rate_limit_violations_identity_key_endpoint_idx" ON "rate_limit_violations"("identity_key", "endpoint");

-- CreateIndex
CREATE INDEX "room_bans_room_id_identity_key_lifted_at_idx" ON "room_bans"("room_id", "identity_key", "lifted_at");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_sessions" ADD CONSTRAINT "room_sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_sessions" ADD CONSTRAINT "room_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_participant_history" ADD CONSTRAINT "room_participant_history_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_participant_history" ADD CONSTRAINT "room_participant_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "username_reservations" ADD CONSTRAINT "username_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_bans" ADD CONSTRAINT "room_bans_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
