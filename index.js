const { google } = require("googleapis");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const keys = require("./keys.json");
const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const dotenv = require("dotenv");
const cors = require("cors");
const querystring = require("querystring");
dotenv.config();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
//variables de entorno
const port = process.env.PORT || 3000;
const calendarId = process.env.CALENDAR_ID_GOOGLE;
const uri = process.env.URL_MONGO;
const subdomain = process.env.SUBDOMAIN_KOMMO;
const dbName = process.env.NAME_DB;
const tokenTidy = process.env.TOKEN_TIDY;

const client = new google.auth.JWT(keys.client_email, null, keys.private_key, [
  "https://www.googleapis.com/auth/calendar",
]);
const jsonResponse = {
  data: {
    user_id: "9896011",
    domain: "borealexpedition",
    users_count: "3",
    admins: [
      {
        id: "9896011",
        name: "Boreal Expedition",
        email: "borealexpedition27072023@gmail.com",
        active: "true",
        is_admin: "Y",
        phone: "+5491164776347",
      },
    ],
    account_id: "29139821",
    tariffName: "pro",
    paid_till: "true",
    current_user: {
      id: "6509141",
      name: "Fernando",
      phone: "+5491164776347",
      email: "borealexpedition27072023@gmail.com",
    },
  },
  success: true,
  tariff: {
    is_active: true,
    expire_at: "11.08.2024",
    expire_at_human: "August 11, 2030",
    type: "pro",
    is_paid: true,
  },
  notifications: [],
};
const clientMongo = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
//funcion para obtener el token
async function getCodes() {
  console.log("getCodes");
  await clientMongo.connect();
  const collection = clientMongo.db(dbName).collection("variables");
  const result = await collection.find().sort({ _id: -1 }).limit(1).toArray();
  variables.access_token = result[0].access_token;
  variables.refreshTkn = result[0].refresh_token;
  console.log("codes obtained");
}
//funcion para renovar el token
async function postRequest() {
  //funcion para renovar el token
  const url = `https://${subdomain}/oauth2/access_token`;
  const data = {
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: variables.refreshTkn,
    redirect_uri: "https://localhost",
  };
  const headers = { "Content-Type": "application/json" };
  try {
    const response = await axios.post(url, data, { headers });
    const parsedData = response.data;
    if ("refresh_token" in parsedData) {
      await uploadCodes(parsedData.access_token, parsedData.refresh_token);
    } else {
      throw new Error("No refresh token in response");
    }
  } catch (error) {
    throw error;
  }
}
//funcion para subir el token a la base de datos
async function uploadCodes(access_token, refresh_token) {
  console.log("uploadCodes");
  await clientMongo.connect();
  const collection = clientMongo.db(dbName).collection("variables");
  await collection.insertOne({
    access_token,
    refresh_token,
    created_at: new Date(),
  });
  console.log("codes uploaded");
}
//function para intercambiar codigo por token
async function refreshTokenFirsTime() {
  console.log("refreshTokenFirsTime");
  const url = `https://${subdomain}/oauth2/access_token`;
  const data = {
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    grant_type: "authorization_code",
    code: process.env.CODE,
    redirect_uri: "https://localhost",
  };
  const headers = { contentType: "application/json" };
  try {
    const response = await axios.post(url, data, { headers });
    const parsedData = response.data;
    if ("refresh_token" in parsedData) {
      await uploadCodes(parsedData.access_token, parsedData.refresh_token);
    } else {
      throw new Error("No refresh token in response");
    }
  } catch (error) {
    throw error;
  }
}
//funcion para subir el next sync token a la base de datos
async function uploadNextSyncToken(nextSyncToken) {
  console.log("uploadNextSyncToken");
  await clientMongo.connect();
  const collection = clientMongo.db(dbName).collection("tokensCalendar");
  await collection.insertOne({
    nextSyncToken,
    created_at: new Date(),
  });
  console.log("nextSyncToken uploaded");
}
//funcion para obtener el next sync token
async function getNextSyncToken() {
  console.log("getNextSyncToken");
  await clientMongo.connect();
  const collection = clientMongo.db(dbName).collection("tokensCalendar");
  const result = await collection.find().sort({ _id: -1 }).limit(1).toArray();
  return result[0].nextSyncToken;
}
//declaro objeto para almacenar los tokens
let variables = {
  access_token: "",
  refreshTkn: "",
};
//funcion para conectarse a calendario
async function connectCalendar() {
  console.log("connectCalendar");
  client.authorize(function (err, tokens) {
    if (err) {
      console.log(err);
      return;
    } else {
      console.log("Connected to calendar");
    }
  });
}

const calendar = google.calendar({ version: "v3", auth: client });
//funcion para suscribirse al webhook
async function suscribeWebhook() {
  await connectCalendar();
  calendar.events.watch(
    {
      calendarId: calendarId,
      resource: {
        id: uuidv4(),
        type: "web_hook",
        address: "https://366f-2800-810-55a-ab26-1451-e3f2-8e0f-a07.ngrok-free.app/webhook",
      },
    },
    function (err, response) {
      if (err) {
        // console.log('Error al configurar el webhook:', err);
        console.log(err.response.data.error);
        return;
      }
      console.log("Webhook configurado correctamente:", response.data);
    }
  );
}
//funcion para detener el webhook
async function stopWebhook() {
    calendar.channels.stop({
        auth: client,
        resource: {
            "id": "42c21fb0-0e21-4e32-a43d-6ae77899bb3b",
            "resourceId": "A_CSaTVl9ZYMYMkoCXH_OZjz15A"
        },
        calendarId: calendarId
    }, function (err, response) {
        if (err) {
            console.log('Error al detener el webhook:', err);
            return;
        }
        console.log('Webhook detenido correctamente:', response.data);
    });
}

//funcion para obtener el ultimo evento creado con el ultimo sync token
async function getLastEventWithSyncToken() {
  //await connectCalendar();
  const dataKommo = {};
  calendar.events.list(
    {
      calendarId: calendarId,
      maxAttendees: 100,
      syncToken: await getNextSyncToken(),
    },
    async function (err, event) {
      if (err) {
        console.log("Error al obtener el evento:", err);
        return;
      }
      let json = event.data.items[0];
      let descriptionParts = json.description.split("\n");
      let newJson = {
        "Invitee": descriptionParts[1].split(": ")[1],
        "Invitee Email": descriptionParts[2].split(": ")[1],
        "kommoId": Number(descriptionParts[5].split(": ")[1])
      };
      console.log(newJson);
      dataKommo.name = newJson["Invitee"];
      dataKommo.email = newJson["Invitee Email"];
      dataKommo.startTime = event.data.items[0].start.dateTime;
      //console.log("Evento obtenido:", event.data);
      //si existe el id de kommo, actualizar el lead
      if (newJson["kommoId"]) {
        console.log("update lead");
       await updateLeadKommo(dataKommo,newJson["kommoId"]);
      } else {
        console.log("create lead");
       await createLeadKommo(dataKommo);
      }
      //subir el next sync token a la base de datos
      await uploadNextSyncToken(event.data.nextSyncToken);
    }
  );
}
//funcion para actualizar lead en kommo
async function updateLeadKommo(data,id) {
    const date = new Date(data.startTime);
    const startTimeUnix = Math.floor(date.getTime() / 1000);
    await getCodes();
    const token = variables.access_token;
    const url = `https://${subdomain}/api/v4/leads/${id}`;
    const headers = { Authorization: `Bearer ${token}` };
    const dataLead = {
      custom_fields_values: [
        {
          field_id: 1396300,
          field_name: "Confirma entrevista",
          field_code: null,
          field_type: "checkbox",
          values: [
            {
              value: true,
            },
          ],
        },
        {
          field_id: 1396296,
          field_name: "Entrevista pactada",
          field_code: null,
          field_type: "date_time",
          values: [
            {
              value: startTimeUnix,
            },
          ],
        }
      ],
      status_id: 59637083,
      pipeline_id: 7200447,
      updated_by: 0,
      updated_at: Math.floor(Date.now() / 1000),
    };
    try {
      const response = await axios.patch(url, dataLead, { headers });
      console.log(response.data);
    } catch (error) {
      console.log(error);
    }

}
//Funcion para crear lead en kommo
async function createLeadKommo(data) {
  const date = new Date(data.startTime);
  const startTimeUnix = Math.floor(date.getTime() / 1000);
  const dataLead = [{
    "name": "Cita nueva " + data.name,
    "_embedded": {
      "contacts": [
        {
          "name": data.name,
          "created_at":  Math.floor(Date.now() / 1000),
          "created_by": 0,
          "custom_fields_values": [
            {
              "field_id": 923316,
              "field_name": "Email",
              "field_code": "EMAIL",
              "field_type": "multitext",
              "values": [
                {
                  "value": data.email,
                  "enum_id": 657974,
                  "enum_code": "WORK"
                }
              ]
            }
          ],
          "updated_by": 0
        }
      ]
    },
    "custom_fields_values": [
      {
        "field_id": 1396300,
        "field_name": "Confirma entrevista",
        "field_code": null,
        "field_type": "checkbox",
        "values": [
          {
            "value": true
          }
        ]
      },
      {
        "field_id": 1396296,
        "field_name": "Entrevista pactada",
        "field_code": null,
        "field_type": "date_time",
        "values": [
          {
            "value": startTimeUnix
          }
        ]
      },
    ],
    "status_id": 59637083,
    "pipeline_id": 7200447,
    "created_by": 0,
    "created_at": Math.floor(Date.now() / 1000)
  }];
  const dataLeadSimple = [{
    "name": "Cita nueva " + data.name,
    "custom_fields_values": [
      {
        "field_id": 1396300,
        "field_name": "Confirma entrevista",
        "field_code": null,
        "field_type": "checkbox",
        "values": [
          {
            "value": true
          }
        ]
      },
      {
        "field_id": 1396296,
        "field_name": "Entrevista pactada",
        "field_code": null,
        "field_type": "date_time",
        "values": [
          {
            "value": startTimeUnix
          }
        ]
      },
      {
        "field_id": 1401956,
        "field_name": "email busqueda",
        "field_code": null,
        "field_type": "text",
        "values": [
        {
        "value": data.email
        }
        ]
        }
    ],
    "status_id": 59637083,
    "pipeline_id": 7200447,
    "created_by": 0,
    "created_at": Math.floor(Date.now() / 1000)
  }]

  await getCodes();
  const token = variables.access_token;
  const url = `https://${subdomain}/api/v4/leads/complex`;
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const response = await axios.post(url, dataLead, { headers });
    const parsedData = response.data;
    console.log(parsedData);
  } catch (error) {
    console.log(error.response.data['validation-errors'][0].errors);
  }
}

//endpoint para obtener el token
app.get("/token", async (req, res) => {
  try {
    await getCodes();
    await postRequest();
    res.status(200).json({ message: "Token obtenido" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});
//endpoint para recibir el webhook de google calendar, filtrando por el header: x-goog-resource-state
app.post("/webhook", async (req, res) => {
  //console.log(req.headers)
  if (req.headers["x-goog-resource-state"] == "exists") {
    console.log("Evento creado");
    //obtener el ultimo evento cread
    await getLastEventWithSyncToken();
    res.status(200).json({ message: "Evento creado" });
    //obtener el ultimo evento cread
  } else if (req.headers["x-goog-resource-state"] == "sync") {
    console.log("Evento sync");
    res.status(200).json({ message: "Evento creado" });
  } else if (req.headers["x-goog-resource-state"] == "deleted") {
    console.log("Evento eliminado");
    res.status(200).json({ message: "Evento eliminado" });
  }
});

//suscribeWebhook();
//levanto el servidor

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

//stopWebhook();