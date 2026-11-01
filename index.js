import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("DISCORD_TOKEN が設定されていません。README.md の手順を確認してください。");
  process.exit(1);
}

const PREFIX = "!";
const GUESS_GAME_DURATION_MS = 5 * 60 * 1000;
const guessGames = new Map();
const slashCommands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("ゲームコマンドの一覧を表示します"),
  new SlashCommandBuilder()
    .setName("janken")
    .setDescription("ボットとじゃんけんをします")
    .addStringOption((option) =>
      option
        .setName("hand")
        .setDescription("あなたの手")
        .setRequired(true)
        .addChoices(
          { name: "グー", value: "グー" },
          { name: "チョキ", value: "チョキ" },
          { name: "パー", value: "パー" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("omikuji")
    .setDescription("今日の運勢を占います"),
  new SlashCommandBuilder()
    .setName("coin")
    .setDescription("コインを投げます"),
  new SlashCommandBuilder()
    .setName("guess")
    .setDescription("1〜100の数字当てゲーム")
    .addSubcommand((subcommand) =>
      subcommand.setName("start").setDescription("数字当てゲームを開始します"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("try")
        .setDescription("数字を予想します")
        .addIntegerOption((option) =>
          option
            .setName("number")
            .setDescription("1〜100の整数")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100),
        ),
    ),
].map((command) => command.toJSON());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const helpMessage = [
  "**CasualGames コマンド**",
  "`!じゃんけん <グー|チョキ|パー>` — ボットとじゃんけん",
  "`!おみくじ` — 今日の運勢を占う",
  "`!数当て` — 1〜100の数字当てゲームを開始",
  "`!数当て <数字>` — 数字を予想する（開始から5分間）",
  "`!コイン` — コインを投げる",
  "`!ヘルプ` — このヘルプを表示",
  "",
  "**スラッシュコマンド**",
  "`/janken hand:<グー|チョキ|パー>` — ボットとじゃんけん",
  "`/omikuji` — 今日の運勢を占う",
  "`/guess start` — 数字当てゲームを開始",
  "`/guess try number:<1〜100>` — 数字を予想（開始から5分間）",
  "`/coin` — コインを投げる",
  "`/help` — このヘルプを表示",
].join("\n");

const fortunes = [
  "大吉！今日は何をしてもうまくいきそう。",
  "中吉！新しいことに挑戦するチャンス。",
  "小吉！焦らず進めば良い結果に。",
  "吉！いつも通りがいちばん。",
  "末吉！思わぬところに小さな幸運が。",
  "凶……今日は無理せず、のんびり過ごそう。",
];

const handNames = ["グー", "チョキ", "パー"];
const handAliases = new Map([
  ["グー", 0],
  ["ぐー", 0],
  ["gu", 0],
  ["rock", 0],
  ["チョキ", 1],
  ["ちょき", 1],
  ["choki", 1],
  ["scissors", 1],
  ["パー", 2],
  ["ぱー", 2],
  ["pa", 2],
  ["paper", 2],
]);

function getGuessGameKey(message) {
  return `${message.channelId}:${message.author.id}`;
}

function getInteractionGuessGameKey(interaction) {
  return `${interaction.channelId}:${interaction.user.id}`;
}

function clearGuessGame(key) {
  const game = guessGames.get(key);
  if (game) {
    clearTimeout(game.expiryTimer);
    guessGames.delete(key);
  }
}

function scheduleGuessGameExpiration(key, game) {
  game.expiryTimer = setTimeout(() => {
    if (guessGames.get(key) === game) {
      guessGames.delete(key);
    }
  }, Math.max(0, game.expiresAt - Date.now()));
  game.expiryTimer.unref();
}

function startGuessGame(key) {
  clearGuessGame(key);
  const game = {
    answer: Math.floor(Math.random() * 100) + 1,
    attempts: 0,
    expiresAt: Date.now() + GUESS_GAME_DURATION_MS,
    expiryTimer: undefined,
  };
  guessGames.set(key, game);
  scheduleGuessGameExpiration(key, game);
  return game;
}

function extendGuessGame(key, game) {
  clearTimeout(game.expiryTimer);
  game.expiresAt = Date.now() + GUESS_GAME_DURATION_MS;
  scheduleGuessGameExpiration(key, game);
}

async function handleMessage(message) {
  if (message.author.bot || !message.content.startsWith(PREFIX)) {
    return;
  }

  const [rawCommand = "", ...args] = message.content
    .slice(PREFIX.length)
    .trim()
    .split(/\s+/);
  const command = rawCommand.toLowerCase();

  switch (command) {
    case "ヘルプ":
    case "help":
      await message.reply(helpMessage);
      break;

    case "じゃんけん":
    case "janken":
    case "rps": {
      const playerHand = handAliases.get((args[0] ?? "").toLowerCase());
      if (playerHand === undefined) {
        await message.reply("手を選んでね：`!じゃんけん グー`、`チョキ`、または`パー`");
        break;
      }

      const botHand = Math.floor(Math.random() * handNames.length);
      const difference = (playerHand - botHand + 3) % 3;
      const result = difference === 0 ? "あいこ！" : difference === 2 ? "あなたの勝ち！" : "ボットの勝ち！";
      await message.reply(`${handNames[playerHand]} vs ${handNames[botHand]} — ${result}`);
      break;
    }

    case "おみくじ":
    case "omikuji":
      await message.reply(`今日の運勢は……**${fortunes[Math.floor(Math.random() * fortunes.length)]}**`);
      break;

    case "コイン":
    case "coin":
    case "coinflip":
      await message.reply(`コインの結果は……**${Math.random() < 0.5 ? "表" : "裏"}！**`);
      break;

    case "数当て":
    case "guess": {
      const key = getGuessGameKey(message);
      const guess = args[0];
      const startsGame = guess === undefined || guess.toLowerCase() === "start";

      if (startsGame) {
        startGuessGame(key);
        await message.reply("1〜100の数字を選んだよ。`!数当て <数字>` で当ててみてね！（5分間有効）");
        break;
      }

      const game = guessGames.get(key);
      if (!game || game.expiresAt <= Date.now()) {
        clearGuessGame(key);
        await message.reply("有効なゲームがないよ。まず `!数当て` でゲームを始めてね。");
        break;
      }

      if (!/^\d+$/.test(guess)) {
        await message.reply("1〜100の整数を入力してね。例：`!数当て 42`");
        break;
      }

      const number = Number(guess);
      if (number < 1 || number > 100) {
        await message.reply("数字は1〜100の範囲で入力してね。");
        break;
      }

      game.attempts += 1;
      extendGuessGame(key, game);
      if (number === game.answer) {
        clearGuessGame(key);
        await message.reply(`正解！**${number}** でした。${game.attempts}回で当てたよ！`);
      } else {
        await message.reply(number < game.answer ? "もっと大きいよ！" : "もっと小さいよ！");
      }
      break;
    }

    default:
      await message.reply("そのコマンドは知らないよ。`!ヘルプ` で一覧を見てね。");
  }
}

async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  switch (interaction.commandName) {
    case "help":
      await interaction.reply(helpMessage);
      break;

    case "janken": {
      const playerHand = handAliases.get(
        interaction.options.getString("hand", true).toLowerCase(),
      );
      const botHand = Math.floor(Math.random() * handNames.length);
      const difference = (playerHand - botHand + 3) % 3;
      const result =
        difference === 0
          ? "あいこ！"
          : difference === 2
            ? "あなたの勝ち！"
            : "ボットの勝ち！";
      await interaction.reply(
        `${handNames[playerHand]} vs ${handNames[botHand]} — ${result}`,
      );
      break;
    }

    case "omikuji":
      await interaction.reply(
        `今日の運勢は……**${fortunes[Math.floor(Math.random() * fortunes.length)]}**`,
      );
      break;

    case "coin":
      await interaction.reply(
        `コインの結果は……**${Math.random() < 0.5 ? "表" : "裏"}！**`,
      );
      break;

    case "guess": {
      const key = getInteractionGuessGameKey(interaction);
      if (interaction.options.getSubcommand() === "start") {
        startGuessGame(key);
        await interaction.reply(
          "1〜100の数字を選んだよ。`/guess try` で予想してね！（5分間有効）",
        );
        break;
      }

      const game = guessGames.get(key);
      if (!game || game.expiresAt <= Date.now()) {
        clearGuessGame(key);
        await interaction.reply(
          "有効なゲームがないよ。まず `/guess start` でゲームを始めてね。",
        );
        break;
      }

      const number = interaction.options.getInteger("number", true);
      game.attempts += 1;
      extendGuessGame(key, game);
      if (number === game.answer) {
        clearGuessGame(key);
        await interaction.reply(
          `正解！**${number}** でした。${game.attempts}回で当てたよ！`,
        );
      } else {
        await interaction.reply(number < game.answer ? "もっと大きいよ！" : "もっと小さいよ！");
      }
      break;
    }
  }
}

client.on("messageCreate", (message) => {
  void handleMessage(message).catch((error) => {
    console.error("メッセージの処理に失敗しました:", error);
  });
});

client.on("interactionCreate", (interaction) => {
  void handleInteraction(interaction).catch((error) => {
    console.error("スラッシュコマンドの処理に失敗しました:", error);
    if (!interaction.isRepliable()) {
      return;
    }

    const response = {
      content: "コマンドの処理に失敗しました。もう一度試してください。",
      ephemeral: true,
    };
    const reply = interaction.replied || interaction.deferred
      ? interaction.followUp(response)
      : interaction.reply(response);
    void reply.catch((replyError) => {
      console.error("エラー通知の送信に失敗しました:", replyError);
    });
  });
});

client.once("ready", (readyClient) => {
  console.log(`${readyClient.user.tag} としてログインしました。`);
  const rest = new REST({ version: "10" }).setToken(token);
  void rest
    .put(Routes.applicationCommands(readyClient.application.id), {
      body: slashCommands,
    })
    .then(() => {
      console.log("スラッシュコマンドをDiscordに登録しました。");
    })
    .catch((error) => {
      console.error("スラッシュコマンドの登録に失敗しました:", error);
    });
});

client.login(token).catch((error) => {
  console.error("Discordへのログインに失敗しました:", error);
  process.exitCode = 1;
});
