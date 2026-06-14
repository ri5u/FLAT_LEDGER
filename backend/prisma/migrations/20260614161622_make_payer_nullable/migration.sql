-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_paidBy_fkey";

-- AlterTable
ALTER TABLE "Expense" ALTER COLUMN "paidBy" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidBy_fkey" FOREIGN KEY ("paidBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
