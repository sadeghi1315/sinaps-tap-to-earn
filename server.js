const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ===============================
// SETTINGS
// ===============================

const ENERGY_REGEN_SECONDS = 3;

// ===============================
// TEST BACKEND
// ===============================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    project: "SINAPS",
    message: "SINAPS Backend is running 🚀"
  });
});

// ===============================
// ENERGY CALCULATION
// ===============================

function calculateEnergy(user) {

  const now = Date.now();

  const lastUpdate =
    new Date(user.last_energy_update).getTime();

  const elapsedSeconds =
    Math.floor((now - lastUpdate) / 1000);

  if (elapsedSeconds <= 0) {
    return {
      energy: user.energy,
      lastEnergyUpdate: user.last_energy_update
    };
  }

  const regenerated =
    Math.floor(
      elapsedSeconds / ENERGY_REGEN_SECONDS
    );

  if (regenerated <= 0) {
    return {
      energy: user.energy,
      lastEnergyUpdate: user.last_energy_update
    };
  }

  const newEnergy =
    Math.min(
      user.max_energy,
      user.energy + regenerated
    );

  // فقط زمانی زمان را جلو می‌بریم که انرژی واقعاً شارژ شده
  const usedSeconds =
    regenerated * ENERGY_REGEN_SECONDS;

  const newLastUpdate =
    new Date(
      lastUpdate + usedSeconds * 1000
    ).toISOString();

  return {
    energy: newEnergy,
    lastEnergyUpdate: newLastUpdate
  };
}

// ===============================
// GET / CREATE USER
// ===============================

app.post("/api/user", async (req, res) => {

  try {

    const {
      telegram_id,
      username
    } = req.body;

    if (!telegram_id) {

      return res.status(400).json({
        error: "telegram_id required"
      });

    }

    let {
      data: user,
      error
    } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_id", telegram_id)
      .single();

    if (
      error &&
      error.code !== "PGRST116"
    ) {
      throw error;
    }

    // ===============================
    // CREATE USER
    // ===============================

    if (!user) {

      const result =
        await supabase
          .from("users")
          .insert({
            telegram_id,
            username: username || null
          })
          .select()
          .single();

      if (result.error) {
        throw result.error;
      }

      user = result.data;

    }

    // ===============================
    // REGENERATE ENERGY
    // ===============================

    const energyData =
      calculateEnergy(user);

    if (
      energyData.energy !== user.energy
    ) {

      const updateResult =
        await supabase
          .from("users")
          .update({
            energy: energyData.energy,
            last_energy_update:
              energyData.lastEnergyUpdate
          })
          .eq("telegram_id", telegram_id)
          .select()
          .single();

      if (updateResult.error) {
        throw updateResult.error;
      }

      user = updateResult.data;

    }

    res.json(user);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Server error"
    });

  }

});

// ===============================
// TAP
// ===============================

app.post("/api/tap", async (req, res) => {

  try {

    const {
      telegram_id
    } = req.body;

    if (!telegram_id) {

      return res.status(400).json({
        error: "telegram_id required"
      });

    }

    // ===============================
    // GET USER
    // ===============================

    const {
      data: user,
      error
    } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_id", telegram_id)
      .single();

    if (error || !user) {

      return res.status(404).json({
        error: "User not found"
      });

    }

    // ===============================
    // REGENERATE ENERGY FIRST
    // ===============================

    const energyData =
      calculateEnergy(user);

    let currentEnergy =
      energyData.energy;

    // ===============================
    // CHECK ENERGY
    // ===============================

    if (currentEnergy <= 0) {

      return res.status(400).json({

        error: "No energy",

        balance: user.balance,

        energy: 0,

        max_energy: user.max_energy

      });

    }

    // ===============================
    // TAP
    // ===============================

    const newBalance =
      Number(user.balance) + 1;

    const newEnergy =
      currentEnergy - 1;

    // ===============================
    // SAVE
    // ===============================

    const {
      data: updated,
      error: updateError
    } = await supabase
      .from("users")
      .update({

        balance: newBalance,

        energy: newEnergy,

        last_energy_update:
          energyData.lastEnergyUpdate

      })
      .eq("telegram_id", telegram_id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // ===============================
    // RESPONSE
    // ===============================

    res.json(updated);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Server error"
    });

  }

});

// ===============================
// SERVER
// ===============================

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(
    `SINAPS Backend running on port ${PORT}`
  );

});
