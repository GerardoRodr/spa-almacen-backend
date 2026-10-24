/*
  Warnings:

  - You are about to drop the column `endHourMeter` on the `MachineryShiftLog` table. All the data in the column will be lost.
  - You are about to drop the column `startHourMeter` on the `MachineryShiftLog` table. All the data in the column will be lost.
  - You are about to drop the column `totalHours` on the `MachineryShiftLog` table. All the data in the column will be lost.
  - Added the required column `startMeter` to the `MachineryShiftLog` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MeterType" AS ENUM ('HOUR_METER', 'KILOMETER');

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "meterType" "MeterType";

-- AlterTable
ALTER TABLE "MachineryShiftLog" DROP COLUMN "endHourMeter",
DROP COLUMN "startHourMeter",
DROP COLUMN "totalHours",
ADD COLUMN     "endMeter" DECIMAL(10,2),
ADD COLUMN     "meterType" "MeterType" NOT NULL DEFAULT 'HOUR_METER',
ADD COLUMN     "startMeter" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "totalUsage" DECIMAL(10,2);
