const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['income', 'expense'],
    required: true
  },
  subtype: {
    type: String,
    required: true,
    trim: true
  },
  icon: {
    type: String,
    default: '📋'
  },
  color: {
    type: String,
    default: '#3B82F6'
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    trim: true
  },
  sortOrder: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for efficient queries
categorySchema.index({ userId: 1, type: 1, isActive: 1 });
categorySchema.index({ userId: 1, isDefault: 1 });
categorySchema.index({ userId: 1, type: 1, subtype: 1 });

// Ensure unique category names per user per type
categorySchema.index({ userId: 1, type: 1, name: 1 }, { unique: true });

// Static method to get default categories
categorySchema.statics.getDefaultCategories = function() {
  return [
    // Income Categories
    { name: 'Salary', type: 'income', subtype: 'employment', icon: '💼', color: '#10B981', isDefault: true, sortOrder: 1 },
    { name: 'Freelance', type: 'income', subtype: 'employment', icon: '💻', color: '#3B82F6', isDefault: true, sortOrder: 2 },
    { name: 'Business', type: 'income', subtype: 'business', icon: '🏢', color: '#8B5CF6', isDefault: true, sortOrder: 3 },
    { name: 'Investment', type: 'income', subtype: 'investment', icon: '📈', color: '#F59E0B', isDefault: true, sortOrder: 4 },
    { name: 'Rental Income', type: 'income', subtype: 'property', icon: '🏠', color: '#EF4444', isDefault: true, sortOrder: 5 },
    { name: 'Side Hustle', type: 'income', subtype: 'employment', icon: '🚀', color: '#06B6D4', isDefault: true, sortOrder: 6 },
    { name: 'Consulting', type: 'income', subtype: 'business', icon: '👔', color: '#84CC16', isDefault: true, sortOrder: 7 },
    { name: 'Other Income', type: 'income', subtype: 'other', icon: '💰', color: '#6B7280', isDefault: true, sortOrder: 8 },

    // Expense Categories
    { name: 'Food & Dining', type: 'expense', subtype: 'daily', icon: '🍽️', color: '#EF4444', isDefault: true, sortOrder: 9 },
    { name: 'Transportation', type: 'expense', subtype: 'transport', icon: '🚗', color: '#3B82F6', isDefault: true, sortOrder: 10 },
    { name: 'Shopping', type: 'expense', subtype: 'retail', icon: '🛍️', color: '#8B5CF6', isDefault: true, sortOrder: 11 },
    { name: 'Bills & Utilities', type: 'expense', subtype: 'utilities', icon: '💡', color: '#F59E0B', isDefault: true, sortOrder: 12 },
    { name: 'Entertainment', type: 'expense', subtype: 'leisure', icon: '🎬', color: '#EC4899', isDefault: true, sortOrder: 13 },
    { name: 'Healthcare', type: 'expense', subtype: 'health', icon: '🏥', color: '#10B981', isDefault: true, sortOrder: 14 },
    { name: 'Education', type: 'expense', subtype: 'education', icon: '📚', color: '#06B6D4', isDefault: true, sortOrder: 15 },
    { name: 'Travel', type: 'expense', subtype: 'leisure', icon: '✈️', color: '#84CC16', isDefault: true, sortOrder: 16 },
    { name: 'Housing', type: 'expense', subtype: 'housing', icon: '🏠', color: '#F97316', isDefault: true, sortOrder: 17 },
    { name: 'Insurance', type: 'expense', subtype: 'insurance', icon: '🛡️', color: '#6366F1', isDefault: true, sortOrder: 18 },
    { name: 'Debt Payment', type: 'expense', subtype: 'debt', icon: '💳', color: '#DC2626', isDefault: true, sortOrder: 19 },
    { name: 'Savings', type: 'expense', subtype: 'savings', icon: '💰', color: '#059669', isDefault: true, sortOrder: 20 },
    { name: 'Investment', type: 'expense', subtype: 'investment', icon: '📈', color: '#7C3AED', isDefault: true, sortOrder: 21 },
    { name: 'Other', type: 'expense', subtype: 'other', icon: '📝', color: '#6B7280', isDefault: true, sortOrder: 22 }
  ];
};

// Static method to get category subtypes
categorySchema.statics.getCategorySubtypes = function() {
  return {
    income: [
      { value: 'employment', label: 'Employment' },
      { value: 'business', label: 'Business' },
      { value: 'investment', label: 'Investment' },
      { value: 'property', label: 'Property' },
      { value: 'other', label: 'Other' }
    ],
    expense: [
      { value: 'daily', label: 'Daily Living' },
      { value: 'transport', label: 'Transportation' },
      { value: 'retail', label: 'Shopping & Retail' },
      { value: 'utilities', label: 'Bills & Utilities' },
      { value: 'leisure', label: 'Entertainment & Leisure' },
      { value: 'health', label: 'Healthcare' },
      { value: 'education', label: 'Education' },
      { value: 'housing', label: 'Housing' },
      { value: 'insurance', label: 'Insurance' },
      { value: 'debt', label: 'Debt Payment' },
      { value: 'savings', label: 'Savings' },
      { value: 'investment', label: 'Investment' },
      { value: 'other', label: 'Other' }
    ]
  };
};

// Instance method to get formatted display name
categorySchema.methods.getDisplayName = function() {
  return `${this.icon} ${this.name}`;
};

// Instance method to get CSS color class
categorySchema.methods.getColorClass = function() {
  const colorMap = {
    '#EF4444': 'text-red-600',
    '#3B82F6': 'text-blue-600',
    '#10B981': 'text-green-600',
    '#F59E0B': 'text-yellow-600',
    '#8B5CF6': 'text-purple-600',
    '#EC4899': 'text-pink-600',
    '#06B6D4': 'text-cyan-600',
    '#84CC16': 'text-lime-600',
    '#F97316': 'text-orange-600',
    '#6366F1': 'text-indigo-600',
    '#DC2626': 'text-red-700',
    '#059669': 'text-emerald-600',
    '#7C3AED': 'text-violet-600',
    '#6B7280': 'text-gray-600'
  };
  return colorMap[this.color] || 'text-gray-600';
};

// Instance method to get background color class
categorySchema.methods.getBgColorClass = function() {
  const colorMap = {
    '#EF4444': 'bg-red-100 dark:bg-red-900/20',
    '#3B82F6': 'bg-blue-100 dark:bg-blue-900/20',
    '#10B981': 'bg-green-100 dark:bg-green-900/20',
    '#F59E0B': 'bg-yellow-100 dark:bg-yellow-900/20',
    '#8B5CF6': 'bg-purple-100 dark:bg-purple-900/20',
    '#EC4899': 'bg-pink-100 dark:bg-pink-900/20',
    '#06B6D4': 'bg-cyan-100 dark:bg-cyan-900/20',
    '#84CC16': 'bg-lime-100 dark:bg-lime-900/20',
    '#F97316': 'bg-orange-100 dark:bg-orange-900/20',
    '#6366F1': 'bg-indigo-100 dark:bg-indigo-900/20',
    '#DC2626': 'bg-red-100 dark:bg-red-900/20',
    '#059669': 'bg-emerald-100 dark:bg-emerald-900/20',
    '#7C3AED': 'bg-violet-100 dark:bg-violet-900/20',
    '#6B7280': 'bg-gray-100 dark:bg-gray-900/20'
  };
  return colorMap[this.color] || 'bg-gray-100 dark:bg-gray-900/20';
};

module.exports = mongoose.model('Category', categorySchema); 