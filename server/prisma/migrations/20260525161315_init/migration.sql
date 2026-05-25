-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'EDITOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'UNLISTED', 'PASSWORD', 'PRIVATE');

-- CreateEnum
CREATE TYPE "BlockType" AS ENUM ('HERO', 'CHILDHOOD', 'EDUCATION', 'CAREER', 'FAMILY', 'HOBBIES', 'LEGACY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('TEXT', 'PHOTO', 'AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('PARENT', 'SPOUSE', 'ADOPTIVE', 'STEP');

-- CreateEnum
CREATE TYPE "TimelineCategory" AS ENUM ('BIRTH', 'DEATH', 'MARRIAGE', 'EDUCATION', 'CAREER', 'RELOCATION', 'AWARD', 'HISTORICAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "telegramId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "deathDate" TIMESTAMP(3),
    "birthPlace" TEXT,
    "deathPlace" TEXT,
    "burialPlace" TEXT,
    "burialLat" DOUBLE PRECISION,
    "burialLng" DOUBLE PRECISION,
    "bio" TEXT,
    "coverPhotoId" TEXT,
    "gender" "Gender" NOT NULL DEFAULT 'UNKNOWN',
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "accessHash" TEXT,
    "ownerId" TEXT NOT NULL,
    "familyNodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileAccess" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentBlock" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "type" "BlockType" NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "photoId" TEXT,
    "order" INTEGER NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryItem" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "caption" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestMemory" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "type" "MemoryType" NOT NULL DEFAULT 'TEXT',
    "text" TEXT,
    "mediaId" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandleLight" (
    "id" TEXT NOT NULL,
    "profileId" TEXT,
    "userId" TEXT,
    "fingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandleLight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyTree" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'UNLISTED',
    "accessHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyTree_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyNode" (
    "id" TEXT NOT NULL,
    "treeId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "maidenName" TEXT,
    "birthDate" TIMESTAMP(3),
    "deathDate" TIMESTAMP(3),
    "gender" "Gender" NOT NULL DEFAULT 'UNKNOWN',
    "photoId" TEXT,
    "clan" TEXT,
    "notes" TEXT,
    "posX" DOUBLE PRECISION,
    "posY" DOUBLE PRECISION,
    "generation" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyConnection" (
    "id" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "type" "RelationType" NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "familyNodeId" TEXT,
    "profileId" TEXT,
    "category" "TimelineCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "dateAccuracy" TEXT,
    "place" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "url" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QrPlaque" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shippedAt" TIMESTAMP(3),

    CONSTRAINT "QrPlaque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileAccessCode" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileAccessCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_slug_key" ON "Profile"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_coverPhotoId_key" ON "Profile"("coverPhotoId");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_familyNodeId_key" ON "Profile"("familyNodeId");

-- CreateIndex
CREATE INDEX "Profile_ownerId_idx" ON "Profile"("ownerId");

-- CreateIndex
CREATE INDEX "Profile_visibility_idx" ON "Profile"("visibility");

-- CreateIndex
CREATE INDEX "Profile_fullName_idx" ON "Profile"("fullName");

-- CreateIndex
CREATE INDEX "ProfileAccess_userId_idx" ON "ProfileAccess"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileAccess_profileId_userId_key" ON "ProfileAccess"("profileId", "userId");

-- CreateIndex
CREATE INDEX "ContentBlock_profileId_type_idx" ON "ContentBlock"("profileId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ContentBlock_profileId_order_key" ON "ContentBlock"("profileId", "order");

-- CreateIndex
CREATE INDEX "GalleryItem_profileId_idx" ON "GalleryItem"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryItem_profileId_order_key" ON "GalleryItem"("profileId", "order");

-- CreateIndex
CREATE INDEX "GuestMemory_profileId_isApproved_idx" ON "GuestMemory"("profileId", "isApproved");

-- CreateIndex
CREATE INDEX "GuestMemory_authorUserId_idx" ON "GuestMemory"("authorUserId");

-- CreateIndex
CREATE INDEX "CandleLight_profileId_createdAt_idx" ON "CandleLight"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "CandleLight_userId_idx" ON "CandleLight"("userId");

-- CreateIndex
CREATE INDEX "CandleLight_fingerprint_createdAt_idx" ON "CandleLight"("fingerprint", "createdAt");

-- CreateIndex
CREATE INDEX "FamilyTree_ownerId_idx" ON "FamilyTree"("ownerId");

-- CreateIndex
CREATE INDEX "FamilyNode_treeId_generation_idx" ON "FamilyNode"("treeId", "generation");

-- CreateIndex
CREATE INDEX "FamilyNode_lastName_firstName_idx" ON "FamilyNode"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "FamilyConnection_toNodeId_type_idx" ON "FamilyConnection"("toNodeId", "type");

-- CreateIndex
CREATE INDEX "FamilyConnection_fromNodeId_type_idx" ON "FamilyConnection"("fromNodeId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyConnection_fromNodeId_toNodeId_type_key" ON "FamilyConnection"("fromNodeId", "toNodeId", "type");

-- CreateIndex
CREATE INDEX "TimelineEvent_familyNodeId_date_idx" ON "TimelineEvent"("familyNodeId", "date");

-- CreateIndex
CREATE INDEX "TimelineEvent_profileId_date_idx" ON "TimelineEvent"("profileId", "date");

-- CreateIndex
CREATE INDEX "TimelineEvent_category_date_idx" ON "TimelineEvent"("category", "date");

-- CreateIndex
CREATE INDEX "Media_uploadedById_idx" ON "Media"("uploadedById");

-- CreateIndex
CREATE INDEX "Media_kind_idx" ON "Media"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "QrPlaque_code_key" ON "QrPlaque"("code");

-- CreateIndex
CREATE INDEX "QrPlaque_profileId_idx" ON "QrPlaque"("profileId");

-- CreateIndex
CREATE INDEX "ProfileAccessCode_profileId_idx" ON "ProfileAccessCode"("profileId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_coverPhotoId_fkey" FOREIGN KEY ("coverPhotoId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_familyNodeId_fkey" FOREIGN KEY ("familyNodeId") REFERENCES "FamilyNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileAccess" ADD CONSTRAINT "ProfileAccess_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileAccess" ADD CONSTRAINT "ProfileAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileAccess" ADD CONSTRAINT "ProfileAccess_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentBlock" ADD CONSTRAINT "ContentBlock_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentBlock" ADD CONSTRAINT "ContentBlock_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryItem" ADD CONSTRAINT "GalleryItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryItem" ADD CONSTRAINT "GalleryItem_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestMemory" ADD CONSTRAINT "GuestMemory_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestMemory" ADD CONSTRAINT "GuestMemory_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestMemory" ADD CONSTRAINT "GuestMemory_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandleLight" ADD CONSTRAINT "CandleLight_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandleLight" ADD CONSTRAINT "CandleLight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyNode" ADD CONSTRAINT "FamilyNode_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "FamilyTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyNode" ADD CONSTRAINT "FamilyNode_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyConnection" ADD CONSTRAINT "FamilyConnection_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "FamilyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyConnection" ADD CONSTRAINT "FamilyConnection_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "FamilyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_familyNodeId_fkey" FOREIGN KEY ("familyNodeId") REFERENCES "FamilyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrPlaque" ADD CONSTRAINT "QrPlaque_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
