//////////////////////////////////////////
//////////////// LOGGING /////////////////
//////////////////////////////////////////
function getCurrentDateString() {
  return (new Date()).toISOString() + ' ::';
};
__originalLog = console.log;
console.log = function () {
  var args = [].slice.call(arguments);
  __originalLog.apply(console.log, [getCurrentDateString()].concat(args));
};
//////////////////////////////////////////
//////////////////////////////////////////

const fs = require('fs');
const util = require('util');
const path = require('path');
const { Readable } = require('stream');

//////////////////////////////////////////
///////////////// VARIA //////////////////
//////////////////////////////////////////

function necessary_dirs() {
  if (!fs.existsSync('./data/')){
      fs.mkdirSync('./data/');
  }
}
necessary_dirs()

function sleep(ms) {
return new Promise((resolve) => {
  setTimeout(resolve, ms);
});
}

async function convert_audio(input) {
  try {
      // stereo to mono channel
      const data = new Int16Array(input)
      const ndata = data.filter((el, idx) => idx % 2);
      return Buffer.from(ndata);
  } catch (e) {
      console.log(e)
      console.log('convert_audio: ' + e)
      throw e;
  }
}
//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////


//////////////////////////////////////////
//////////////// CONFIG //////////////////
//////////////////////////////////////////

const SETTINGS_FILE = 'settings.json';

let DISCORD_TOK = null;
let WITAI_TOK = null; 
let SPEECH_METHOD = 'vosk'; // witai, google, vosk

function loadConfig() {
  if (fs.existsSync(SETTINGS_FILE)) {
      const CFG_DATA = JSON.parse( fs.readFileSync(SETTINGS_FILE, 'utf8') );
      DISCORD_TOK = CFG_DATA.DISCORD_TOK;
      WITAI_TOK = CFG_DATA.WITAI_TOK;
      SPEECH_METHOD = CFG_DATA.SPEECH_METHOD;
  }
  DISCORD_TOK = process.env.DISCORD_TOK || DISCORD_TOK;
  WITAI_TOK = process.env.WITAI_TOK || WITAI_TOK;
  SPEECH_METHOD = process.env.SPEECH_METHOD || SPEECH_METHOD;

  if (!['witai', 'google', 'vosk'].includes(SPEECH_METHOD))
      throw 'invalid or missing SPEECH_METHOD'
  if (!DISCORD_TOK)
      throw 'invalid or missing DISCORD_TOK'
  if (SPEECH_METHOD === 'witai' && !WITAI_TOK)
      throw 'invalid or missing WITAI_TOK'
  if (SPEECH_METHOD === 'google' && !fs.existsSync('./gspeech_key.json'))
      throw 'missing gspeech_key.json'
  
}
loadConfig()

const https = require('https')
function listWitAIApps(cb) {
  const options = {
    hostname: 'api.wit.ai',
    port: 443,
    path: '/apps?offset=0&limit=100',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer '+WITAI_TOK,
    },
  }

  const req = https.request(options, (res) => {
    res.setEncoding('utf8');
    let body = ''
    res.on('data', (chunk) => {
      body += chunk
    });
    res.on('end',function() {
      cb(JSON.parse(body))
    })
  })

  req.on('error', (error) => {
    console.error(error)
    cb(null)
  })
  req.end()
}
function updateWitAIAppLang(appID, lang, cb) {
  const options = {
    hostname: 'api.wit.ai',
    port: 443,
    path: '/apps/' + appID,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer '+WITAI_TOK,
    },
  }
  const data = JSON.stringify({
    lang
  })

  const req = https.request(options, (res) => {
    res.setEncoding('utf8');
    let body = ''
    res.on('data', (chunk) => {
      body += chunk
    });
    res.on('end',function() {
      cb(JSON.parse(body))
    })
  })
  req.on('error', (error) => {
    console.error(error)
    cb(null)
  })
  req.write(data)
  req.end()
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////


const Discord = require('discord.js')
const DISCORD_MSG_LIMIT = 2000;
const discordClient = new Discord.Client()
if (process.env.DEBUG)
  discordClient.on('debug', console.debug);
discordClient.on('ready', () => {
  console.log(`Logged in as ${discordClient.user.tag}!`)
})
discordClient.login(DISCORD_TOK)

// discordClient.on('Sacate', async (msg) => {
//   console.log('Entre a sacate: ' + msg)
//   try {
//     console.log('antes de guild: ' + msg.guild)
//     // Ignore messages that aren't from a guild
//     if (!msg.guild) return;
//     console.log('despues de guild: ' + msg.guild)
//     // If the msg content starts with "!kick"
//     if (msg.content.startsWith('!caile')) {
//       console.log('Entre a caile: ', msg.content)
//       // Assuming we mention someone in the msg, this will return the user
//       const user = msg.mentions.users.first();
//       // If we have a user mentioned
//       if (user) {
//         // Now we get the member from the user
//         const member = msg.guild.member(user);
//         // If the member is in the guild
//         if (member) {
//           /**
//            * Kick the member
//            * Make sure you run this on a member, not a user!
//            * There are big differences between a user and a member
//            */
//           member
//             .kick('Hora a chingar a su madre !')
//             .then(() => {
//               // We let the msg author know we were able to kick the person
//               msg.reply(`${user.tag}, Lo sacamos alv`);
//             })
//             .catch(err => {
//               // An error happened
//               // This is generally due to the bot not being able to kick the member,
//               // either due to missing permissions or role hierarchy
//               msg.reply('Es vergas no lo pude sacar');
//               // Log the error
//               console.error(err);
//             });
//         } else {
//           // The mentioned user isn't in this guild
//           msg.reply("que pedo, que pedooo!");
//         }
//         // Otherwise, if no user was mentioned
//       } else {
//         msg.reply("Eso no hacemos aqui muchacho!");
//       }
//     }
//   } catch (e) {
//     console.log('Mensaje de discordCliente: ' + e)
//     msg.reply('Error: Algo esta pasanda !, intento de new o de plano mandale correo al que hizo esta madre.');
//   }
// });

const PREFIX = '|';
const _CMD_HELP        = PREFIX + 'aiuda';
const _CMD_JOIN        = PREFIX + 'entrar';
const _CMD_LEAVE       = PREFIX + 'adios';
const _CMD_DEBUG       = PREFIX + 'debug';
const _CMD_TEST        = PREFIX + 'hola';
const _CMD_LANG        = PREFIX + 'lang';
const _CMD_MUTE        = PREFIX + 'callate';

const guildMap = new Map();


discordClient.on('message', async (msg) => {
  try {
      if (!('guild' in msg) || !msg.guild) return; // prevent private messages to bot
      const mapKey = msg.guild.id;
      if (msg.content.trim().toLowerCase() == _CMD_JOIN) {
          if (!msg.member.voice.channelID) {
              msg.reply('Error: Primero conectate a algun canal animal.')
          } else {
              if (!guildMap.has(mapKey))
                  await connect(msg, mapKey)
              else
                  msg.reply('Ya llegue prros')
          }
      } else if (msg.content.trim().toLowerCase() == _CMD_MUTE) {                 //COMANDO MUTE

        // Fetch a single member without caching
        // guild.members.fetch({ user, cache: false })
        //   .then(console.log)
        //   .catch(console.error);

        console.log('Antes de user: ' + msg)
        console.log('Estructura user: ' + discordClient.user)
        //const user = msg.mentions.users.first();
        const user = discordClient.user
        const guild = discordClient.guilds.cache.get('Guild ID')

        //const member = guild.member(user).hasPermission('KICK_MEMBERS');

        guild.member(user).hasPermission('KICK_MEMBERS').kick();

        // console.log('Despues de user: ' + user)
        // // If we have a user mentioned
        // if (user) {
          
          
        //   console.log('antes de member: ' + user)
        //   // Now we get the member from the user
        //   //const member = msg.guild.member(user).hasPermission('KICK_MEMBERS');
        //   // If the member is in the guild
        //   console.log('Despues de member: ' + member)
        //   if (member) {
        //     console.log('En if de member: ' + member)
            /**
             * Kick the member
             * Make sure you run this on a member, not a user!
             * There are big differences between a user and a member
             */
            //  member.edit(true, "Alv por puto")
            //   .then(()=>
            //   {msg.reply(`${user.tag}, Lo sacamos alv`);})
            //   .catch(err => {
            //     // An error happened
            //     // This is generally due to the bot not being able to kick the member,
            //     // either due to missing permissions or role hierarchy
            //     msg.reply('Es vergas no lo pude mutear');
            //     console.error(err);});

            //   console.log('await: ' + member)
            //   await GuildMember.edit.setMute(true);

            
              // .then(() => {
              //   // We let the msg author know we were able to kick the person
              //   msg.reply(`${user.tag}, Lo sacamos alv`);
              // })
              // .catch(err => {
              //   // An error happened
              //   // This is generally due to the bot not being able to kick the member,
              //   // either due to missing permissions or role hierarchy
              //   msg.reply('Es vergas no lo pude sacar');
              //   // Log the error
              //   console.error(err);
              // });
          // } else {
          //   // The mentioned user isn't in this guild
          //   msg.reply("que pedo, que pedooo!");
          // }
        // }
      } else if (msg.content.trim().toLowerCase() == _CMD_LEAVE) {              // FIN COMANDO MUTE
          if (guildMap.has(mapKey)) {
              let val = guildMap.get(mapKey);
              if (val.voice_Channel) val.voice_Channel.leave()
              if (val.voice_Connection) val.voice_Connection.disconnect()
              guildMap.delete(mapKey)
              msg.reply("Ya me voy alv.")
          } else {
              msg.reply("No mames, ni conectado estoy.")
          }
      } else if (msg.content.trim().toLowerCase() == _CMD_HELP) {
          msg.reply(getHelpString());
      }
      else if (msg.content.trim().toLowerCase() == _CMD_DEBUG) {
          console.log('toggling debug mode')
          let val = guildMap.get(mapKey);
          if (val.debug)
              val.debug = false;
          else
              val.debug = true;
      }
      else if (msg.content.trim().toLowerCase() == _CMD_TEST) {
          msg.reply('Te estoy probando, Mmmm que rico !!!')
      }
      else if (msg.content.split('\n')[0].split(' ')[0].trim().toLowerCase() == _CMD_LANG) {
          if (SPEECH_METHOD === 'witai') {
            const lang = msg.content.replace(_CMD_LANG, '').trim().toLowerCase()
            listWitAIApps(data => {
              if (!data.length)
                return msg.reply('no apps found! :(')
              for (const x of data) {
                updateWitAIAppLang(x.id, lang, data => {
                  if ('success' in data)
                    msg.reply('succes!')
                  else if ('error' in data && data.error !== 'Access token does not match')
                    msg.reply('Error: ' + data.error)
                })
              }
            })
          } else if (SPEECH_METHOD === 'vosk') {
            let val = guildMap.get(mapKey);
            const lang = msg.content.replace(_CMD_LANG, '').trim().toLowerCase()
            val.selected_lang = lang;
          } else {
            msg.reply('Error: Esta caracteristica es solo para los fresas de google')
          }
      }
  } catch (e) {
      console.log('Mensaje de discordCliente: ' + e)
      msg.reply('Error#180: Algo esta pasanda !, intento de new o de plano mandale correo al que hizo esta madre.');
  }
})

function getHelpString() {
  let out = 'Comandos para la raza pacheca:\n'
      out += '\n'
      out += PREFIX + 'entrar\n';
      out += PREFIX + 'salir\n';
      out += PREFIX + 'hola\n';
      out += '\n'
  return out;
}

const SILENCE_FRAME = Buffer.from([0xF8, 0xFF, 0xFE]);

class Silence extends Readable {
  _read() {
    this.push(SILENCE_FRAME);
    this.destroy();
  }
}

async function connect(msg, mapKey) {
  try {
      let voice_Channel = await discordClient.channels.fetch(msg.member.voice.channelID);
      if (!voice_Channel) return msg.reply("Error: Ora prro ese canal de voz no existe!");
      let text_Channel = await discordClient.channels.fetch(msg.channel.id);
      if (!text_Channel) return msg.reply("Error: Ora prro ese canal de texto no existe!");
      let voice_Connection = await voice_Channel.join();
      voice_Connection.play(new Silence(), { type: 'opus' });
      guildMap.set(mapKey, {
          'text_Channel': text_Channel,
          'voice_Channel': voice_Channel,
          'voice_Connection': voice_Connection,
          'selected_lang': 'es',
          'debug': false,
      });
      speak_impl(voice_Connection, mapKey)
      voice_Connection.on('Me largo!', async(e) => {
          if (e) console.log(e);
          guildMap.delete(mapKey);
      })
      msg.reply('Ya llegue prros!')
  } catch (e) {
      console.log('Conexion: ' + e)
      msg.reply('Error: No pude conectarme, toy chiquito.');
      throw e;
  }
}

const vosk = require('vosk');
let recs = {}
if (SPEECH_METHOD === 'vosk') {
  vosk.setLogLevel(-1);
  // MODELS: https://alphacephei.com/vosk/models
  recs = {
    //'en': new vosk.Recognizer({model: new vosk.Model('vosk_models/en'), sampleRate: 48000}),
    // 'fr': new vosk.Recognizer({model: new vosk.Model('vosk_models/fr'), sampleRate: 48000}),
    'es': new vosk.Recognizer({model: new vosk.Model('vosk_models/es'), sampleRate: 48000}),
  }
  // download new models if you need
  // dev reference: https://github.com/alphacep/vosk-api/blob/master/nodejs/index.js
}


function speak_impl(voice_Connection, mapKey) {
  voice_Connection.on('Hablando', async (user, speaking) => {
      if (speaking.bitfield == 0 || user.bot) {
          return
      }
      console.log(`Este prro esta hablando ${user.username}`)
      // this creates a 16-bit signed PCM, stereo 48KHz stream
      const audioStream = voice_Connection.receiver.createStream(user, { mode: 'pcm' })
      audioStream.on('error',  (e) => { 
          console.log('audioStream: ' + e)
      });
      let buffer = [];
      audioStream.on('data', (data) => {
          buffer.push(data)
      })
      audioStream.on('final', async () => {
          buffer = Buffer.concat(buffer)
          const duration = buffer.length / 48000 / 4;
          console.log("Duracion: " + duration)

          if (SPEECH_METHOD === 'witai' || SPEECH_METHOD === 'google') {
          if (duration < 1.0 || duration > 19) { // 20 seconds max dur
              console.log("TOO SHORT / TOO LONG; SKPPING")
              return;
          }
          }

          try {
              let new_buffer = await convert_audio(buffer)
              let out = await transcribe(new_buffer, mapKey);
              if (out != null)
                  process_commands_query(out, mapKey, user);
          } catch (e) {
              console.log('tmpraw rename: ' + e)
          }


      })
  })
}

function process_commands_query(txt, mapKey, user) {
  if (txt && txt.length) {
      let val = guildMap.get(mapKey);
      val.text_Channel.send(user.username + ': ' + txt)
  }
}


//////////////////////////////////////////
//////////////// SPEECH //////////////////
//////////////////////////////////////////
async function transcribe(buffer, mapKey) {
if (SPEECH_METHOD === 'witai') {
    return transcribe_witai(buffer)
} else if (SPEECH_METHOD === 'google') {
    return transcribe_gspeech(buffer)
} else if (SPEECH_METHOD === 'vosk') {
    let val = guildMap.get(mapKey);
    recs[val.selected_lang].acceptWaveform(buffer);
    let ret = recs[val.selected_lang].result().text;
    console.log('vosk:', ret)
    return ret;
}
}

// WitAI
let witAI_lastcallTS = null;
const witClient = require('node-witai-speech');
async function transcribe_witai(buffer) {
  try {
      // ensure we do not send more than one request per second
      if (witAI_lastcallTS != null) {
          let now = Math.floor(new Date());    
          while (now - witAI_lastcallTS < 1000) {
              console.log('sleep')
              await sleep(100);
              now = Math.floor(new Date());
          }
      }
  } catch (e) {
      console.log('transcribe_witai 837:' + e)
  }

  try {
      console.log('transcribe_witai')
      const extractSpeechIntent = util.promisify(witClient.extractSpeechIntent);
      var stream = Readable.from(buffer);
      const contenttype = "audio/raw;encoding=signed-integer;bits=16;rate=48k;endian=little"
      const output = await extractSpeechIntent(WITAI_TOK, stream, contenttype)
      witAI_lastcallTS = Math.floor(new Date());
      console.log(output)
      stream.destroy()
      if (output && '_text' in output && output._text.length)
          return output._text
      if (output && 'text' in output && output.text.length)
          return output.text
      return output;
  } catch (e) { console.log('transcribe_witai 851:' + e); console.log(e) }
}

// Google Speech API
// https://cloud.google.com/docs/authentication/production
const gspeech = require('@google-cloud/speech');
const gspeechclient = new gspeech.SpeechClient({
projectId: 'discordbot',
keyFilename: 'gspeech_key.json'
});

async function transcribe_gspeech(buffer) {
try {
    console.log('transcribe_gspeech')
    const bytes = buffer.toString('base64');
    const audio = {
      content: bytes,
    };
    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 48000,
      languageCode: 'en-US',  // https://cloud.google.com/speech-to-text/docs/languages
    };
    const request = {
      audio: audio,
      config: config,
    };

    const [response] = await gspeechclient.recognize(request);
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');
    console.log(`gspeech: ${transcription}`);
    return transcription;

} catch (e) { console.log('transcribe_gspeech 368:' + e) }
}

//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////