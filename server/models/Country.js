const mongoose = require("mongoose");

const CountrySchema = new mongoose.Schema(
  {
    id: { type: String },
    name: { type: String, required: true },
    flag: String,
    code: String,
    capital: String,
    region: String,
    currency: String,
    language: String,
    visa: {
      type: { type: String },
      processingTime: String,
      cost: String,
      validity: String,
      documents: [String],
      notes: String,
    },
    passport: {
      minValidity: String,
      notes: String,
    },
    costs: {
      monthlyLivingMin: Number,
      monthlyLivingMax: Number,
      currency: String,
      applicationFee: String,
      tuitionRange: String,
    },
    popular: [String],
    eligibility: {
      minAge: Number,
      minFunds: Number,
      fundsCurrency: String,
      restrictedNationalities: [String],
    },
  },
  { timestamps: true },
);

CountrySchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Country", CountrySchema);
