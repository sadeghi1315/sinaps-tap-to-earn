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

const ENERGY_REGEN_SECONDS = 3;

// ===============================
// HOME
// ===============================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    project: "SINAPS",
    message: "SINAPS Backend is running 🚀"
  });
});

// ===============================
// ENERGY
// ===============================

function calculateEnergy(user) {

  const now = Date.now();

  const lastUpdate =
    new Date(user.last_energy_update).getTime();

  const elapsedSeconds =
    Math.floor((now - lastUpdate) / 1000);

  if (elapsedSeconds <= 0) {
    return {
      energy: Number(user.energy),
      lastEnergyUpdate: user.last_energy_update
    };
  }

  const regenerated =
    Math.floor(
      elapsedSeconds / ENERGY_REGEN_SECONDS
    );

  if (regenerated <= 0) {
    return {
      energy: Number(user.energy),
      lastEnergyUpdate: user.last_energy_update
    };
  }

  const newEnergy =
    Math.min(
      Number(user.max_energy),
      Number(user.energy) + regenerated
    );

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
// USER
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

    const energyData =
      calculateEnergy(user);

    if (
      energyData.energy !== Number(user.energy)
    ) {

      const result =
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

      if (result.error) {
        throw result.error;
      }

      user = result.data;
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
// TAP - BATCH
// ===============================

app.post("/api/tap", async (req, res) => {

  try {

    const {
      telegram_id,
      taps
    } = req.body;

    if (!telegram_id) {
      return res.status(400).json({
        error: "telegram_id required"
      });
    }

    let tapCount =
      Number(taps || 1);

    if (!Number.isFinite(tapCount)) {
      tapCount = 1;
    }

    tapCount =
      Math.floor(tapCount);

    // امنیت: حداکثر 50 Tap در هر درخواست
    tapCount =
      Math.max(
        1,
        Math.min(50, tapCount)
      );

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

    // محاسبه Energy جدید
    const energyData =
      calculateEnergy(user);

    const availableEnergy =
      Number(energyData.energy);

    // فقط به اندازه Energy موجود Tap قبول می‌کنیم
    const acceptedTaps =
      Math.min(
        tapCount,
        availableEnergy
      );

    if (acceptedTaps <= 0) {

      return res.status(400).json({
        error: "No energy",
        balance: Number(user.balance),
        energy: 0,
        max_energy: Number(user.max_energy),
        accepted_taps: 0
      });
    }

    const newBalance =
      Number(user.balance) +
      acceptedTaps;

    const newEnergy =
      availableEnergy -
      acceptedTaps;

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

    res.json({
      success: true,
      balance: Number(updated.balance),
      energy: Number(updated.energy),
      max_energy: Number(updated.max_energy),
      accepted_taps: acceptedTaps
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "Server error"
    });
  }
});

// ===============================
// DAILY BONUS
// ===============================

app.post("/api/daily", async (req, res) => {

  try {

    const {
      telegram_id
    } = req.body;

    if (!telegram_id) {
      return res.status(400).json({
        error: "telegram_id required"
      });
    }

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

    const today =
      new Date()
        .toISOString()
        .slice(0, 10);

    if (user.last_daily_bonus) {

      const lastBonus =
        new Date(user.last_daily_bonus)
          .toISOString()
          .slice(0, 10);

      if (lastBonus === today) {

        return res.status(400).json({
          error: "Daily bonus already claimed",
          balance: Number(user.balance)
        });
      }
    }

    const bonus = 100;

    const newBalance =
      Number(user.balance) +
      bonus;

    const {
      data: updated,
      error: updateError
    } = await supabase
      .from("users")
      .update({
        balance: newBalance,
        last_daily_bonus:
          new Date().toISOString()
      })
      .eq("telegram_id", telegram_id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    res.json({
      success: true,
      bonus,
      balance: Number(updated.balance),
      last_daily_bonus:
        updated.last_daily_bonus
    });

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
