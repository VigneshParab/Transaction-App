const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');

const app = express();
app.use(express.json());

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/transactionsDB', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Define the Transaction Schema
const transactionSchema = new mongoose.Schema({
    title: String,
    description: String,
    price: Number,
    category: String,
    dateOfSale: Date,
    sold: Boolean
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// Route to fetch and initialize data from third-party API
app.get('/initialize', async (req, res) => {
    try {
        const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
        await Transaction.insertMany(response.data);
        res.status(200).send("Database initialized successfully");
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Route to list transactions with search and pagination
app.get('/transactions', async (req, res) => {
    const { month, search = '', page = 1, perPage = 10 } = req.query;
    const regex = new RegExp(search, 'i');
    const startDate = new Date(`2023-${month}-01`);
    const endDate = new Date(`2023-${parseInt(month) + 1}-01`);

    try {
        const transactions = await Transaction.find({
            dateOfSale: { $gte: startDate, $lt: endDate },
            $or: [
                { title: regex },
                { description: regex },
                { price: { $regex: regex } }
            ]
        })
        .skip((page - 1) * perPage)
        .limit(parseInt(perPage));

        res.status(200).json(transactions);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Route for statistics
app.get('/statistics', async (req, res) => {
    const { month } = req.query;
    const startDate = new Date(`2023-${month}-01`);
    const endDate = new Date(`2023-${parseInt(month) + 1}-01`);

    try {
        const totalSoldItems = await Transaction.countDocuments({ sold: true, dateOfSale: { $gte: startDate, $lt: endDate } });
        const totalNotSoldItems = await Transaction.countDocuments({ sold: false, dateOfSale: { $gte: startDate, $lt: endDate } });
        const totalSaleAmount = await Transaction.aggregate([
            { $match: { sold: true, dateOfSale: { $gte: startDate, $lt: endDate } } },
            { $group: { _id: null, total: { $sum: "$price" } } }
        ]);

        res.json({
            totalSoldItems,
            totalNotSoldItems,
            totalSaleAmount: totalSaleAmount[0]?.total || 0
        });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Route for bar chart data
app.get('/barchart', async (req, res) => {
    const { month } = req.query;
    const startDate = new Date(`2023-${month}-01`);
    const endDate = new Date(`2023-${parseInt(month) + 1}-01`);

    try {
        const priceRanges = await Transaction.aggregate([
            { $match: { dateOfSale: { $gte: startDate, $lt: endDate } } },
            {
                $bucket: {
                    groupBy: "$price",
                    boundaries: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
                    default: "901-above",
                    output: { count: { $sum: 1 } }
                }
            }
        ]);
        res.json(priceRanges);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Route for pie chart data
app.get('/piechart', async (req, res) => {
    const { month } = req.query;
    const startDate = new Date(`2023-${month}-01`);
    const endDate = new Date(`2023-${parseInt(month) + 1}-01`);

    try {
        const categories = await Transaction.aggregate([
            { $match: { dateOfSale: { $gte: startDate, $lt: endDate } } },
            { $group: { _id: "$category", count: { $sum: 1 } } }
        ]);

        res.json(categories);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
