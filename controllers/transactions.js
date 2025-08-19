const mongoose = require('mongoose');
const Transaction = mongoose.model('Transaction');
const { startOfMonth, endOfMonth, eachDayOfInterval, format } = require('date-fns');

async function getCategoryExpenses(userId, period = 'all') {
  if (!mongoose.Types.ObjectId.isValid(userId)) throw new Error('Invalid userId');
  const oid = new mongoose.Types.ObjectId(userId);
  const match = { userId: oid, type: 'expense' };
  const now = new Date();

  if (period === 'month') {
    match.transactionDate = {
      $gte: new Date(now.getFullYear(), now.getMonth(), 1),
      $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1)
    };
  } else if (period === 'year') {
    match.transactionDate = {
      $gte: new Date(now.getFullYear(), 0, 1),
      $lt: new Date(now.getFullYear() + 1, 0, 1)
    };
  }

  const raw = await Transaction.aggregate([
    { $match: match },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
    { $project: { _id: 0, category: '$_id', total: 1 } },
    { $sort: { total: -1 } }
  ]);

  return raw;
}

async function getDailyTransactions(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid userId');
  }

  const oid = new mongoose.Types.ObjectId(userId);

  // 1. Define range for current month
  const now = new Date();
  const start = startOfMonth(now);
  const end = endOfMonth(now);

  // 2. Aggregate actual transactions within this month
  const raw = await Transaction.aggregate([
    {
      $match: {
        userId: oid,
        transactionDate: {
          $gte: start,
          $lte: end
        }
      }
    },
    {
      $group: {
        _id: {
          date: {
            $dateToString: { format: '%Y-%m-%d', date: '$transactionDate' }
          },
          type: '$type'
        },
        total: { $sum: '$amount' }
      }
    },
    {
      $project: {
        _id: 0,
        date: '$_id.date',
        type: '$_id.type',
        total: 1
      }
    }
  ]);

  // 3. Build a map of transactions by date
  const dataByDate = {};
  raw.forEach(({ date, type, total }) => {
    if (!dataByDate[date]) {
      dataByDate[date] = { income: 0, expense: 0 };
    }
    dataByDate[date][type] = total;
  });

  // 4. Generate all dates in the month
  const allDays = eachDayOfInterval({ start, end });
  const result = allDays.map((date) => {
    const formatted = format(date, 'yyyy-MM-dd');
    const entry = dataByDate[formatted] || { income: 0, expense: 0 };
    return {
      date: formatted,
      income: entry.income,
      expense: entry.expense
    };
  });

  return result;
}

module.exports = {getCategoryExpenses, getDailyTransactions };
