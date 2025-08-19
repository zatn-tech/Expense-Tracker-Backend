const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Category = require('../models/Category');
const catchAsync = require('../utils/catchAsync');

// Get all categories for a user
router.get('/:userId/categories', auth, catchAsync(async (req, res) => {
  const { userId } = req.params;
  
  if (req.user.id !== userId) {
    return res.status(403).json({ message: 'Access denied' });
  }

  const categories = await Category.find({ 
    userId, 
    isActive: true 
  }).sort({ sortOrder: 1, name: 1 });

  res.json(categories);
}));

// Get categories by type
router.get('/:userId/categories/:type', auth, catchAsync(async (req, res) => {
  const { userId, type } = req.params;
  
  if (req.user.id !== userId) {
    return res.status(403).json({ message: 'Access denied' });
  }

  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ message: 'Invalid category type' });
  }

  const categories = await Category.find({ 
    userId, 
    type, 
    isActive: true 
  }).sort({ sortOrder: 1, name: 1 });

  res.json(categories);
}));

// Create a new category
router.post('/:userId/categories', auth, catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { name, type, subtype, icon, color, description } = req.body;
  
  if (req.user.id !== userId) {
    return res.status(403).json({ message: 'Access denied' });
  }

  if (!name || !type || !subtype) {
    return res.status(400).json({ message: 'Name, type, and subtype are required' });
  }

  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ message: 'Invalid category type' });
  }

  // Check if category already exists for this user and type
  const existingCategory = await Category.findOne({ 
    userId, 
    type, 
    name: { $regex: new RegExp(`^${name}$`, 'i') }
  });

  if (existingCategory) {
    return res.status(400).json({ message: 'Category already exists' });
  }

  const category = new Category({
    userId,
    name,
    type,
    subtype,
    icon: icon || '📋',
    color: color || '#3B82F6',
    description: description || '',
    sortOrder: 0
  });

  await category.save();
  res.status(201).json(category);
}));

// Update a category
router.put('/:userId/categories/:categoryId', auth, catchAsync(async (req, res) => {
  const { userId, categoryId } = req.params;
  const { name, type, subtype, icon, color, description } = req.body;
  
  if (req.user.id !== userId) {
    return res.status(403).json({ message: 'Access denied' });
  }

  const category = await Category.findOne({ _id: categoryId, userId });
  
  if (!category) {
    return res.status(404).json({ message: 'Category not found' });
  }

  if (category.isDefault) {
    return res.status(400).json({ message: 'Cannot modify default categories' });
  }

  // Check if new name conflicts with existing category
  if (name && name !== category.name) {
    const existingCategory = await Category.findOne({ 
      userId, 
      type: type || category.type, 
      name: { $regex: new RegExp(`^${name}$`, 'i') },
      _id: { $ne: categoryId }
    });

    if (existingCategory) {
      return res.status(400).json({ message: 'Category name already exists' });
    }
  }

  category.name = name || category.name;
  category.type = type || category.type;
  category.subtype = subtype || category.subtype;
  category.icon = icon || category.icon;
  category.color = color || category.color;
  category.description = description !== undefined ? description : category.description;

  await category.save();
  res.json(category);
}));

// Delete a category
router.delete('/:userId/categories/:categoryId', auth, catchAsync(async (req, res) => {
  const { userId, categoryId } = req.params;
  
  if (req.user.id !== userId) {
    return res.status(403).json({ message: 'Access denied' });
  }

  const category = await Category.findOne({ _id: categoryId, userId });
  
  if (!category) {
    return res.status(404).json({ message: 'Category not found' });
  }

  if (category.isDefault) {
    return res.status(400).json({ message: 'Cannot delete default categories' });
  }

  await Category.findByIdAndDelete(categoryId);
  res.json({ message: 'Category deleted successfully' });
}));

// Toggle category active status
router.patch('/:userId/categories/:categoryId', auth, catchAsync(async (req, res) => {
  const { userId, categoryId } = req.params;
  const { isActive } = req.body;
  
  if (req.user.id !== userId) {
    return res.status(403).json({ message: 'Access denied' });
  }

  const category = await Category.findOne({ _id: categoryId, userId });
  
  if (!category) {
    return res.status(404).json({ message: 'Category not found' });
  }

  if (category.isDefault) {
    return res.status(400).json({ message: 'Cannot modify default categories' });
  }

  category.isActive = isActive;
  await category.save();
  
  res.json(category);
}));

// Initialize default categories for a user
router.post('/:userId/categories/initialize', auth, catchAsync(async (req, res) => {
  const { userId } = req.params;
  
  if (req.user.id !== userId) {
    return res.status(403).json({ message: 'Access denied' });
  }

  // Check if user already has categories
  const existingCategories = await Category.find({ userId });
  
  if (existingCategories.length > 0) {
    return res.status(400).json({ message: 'Categories already initialized' });
  }

  const defaultCategories = Category.getDefaultCategories();
  const categoriesToCreate = defaultCategories.map(cat => ({
    ...cat,
    userId
  }));

  const createdCategories = await Category.insertMany(categoriesToCreate);
  
  res.status(201).json({
    message: 'Default categories initialized successfully',
    categories: createdCategories
  });
}));

// Get category subtypes
router.get('/:userId/categories/subtypes/:type', auth, catchAsync(async (req, res) => {
  const { userId, type } = req.params;
  
  if (req.user.id !== userId) {
    return res.status(403).json({ message: 'Access denied' });
  }

  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ message: 'Invalid category type' });
  }

  const subtypes = Category.getCategorySubtypes()[type] || [];
  res.json(subtypes);
}));

module.exports = router; 