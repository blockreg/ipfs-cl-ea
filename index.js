const fs = require('fs');
const { Requester, AdapterError  } = require('@chainlink/external-adapter');
const toBuffer = require('it-to-buffer');
const ipfsClient = require('ipfs-http-client');
const defaultIpfsOptions = {
  'host': 'ipfs.infura.io', 
  'port': '5001', 
  'protocol': 'https'
};
const allowedEndpoints = ['add','get'];
let jobRunID = 1;

// Define custom error scenarios for the API.
// Return true for the adapter to retry.
const customError = (data) => {
  if (data.Response === 'Error') return true
  return false
}

const validateInput = (input) => {
  if ( input.endpoint && !allowedEndpoints.includes(input.endpoint) ) {
    return throwError(`Endpoint not currently supported. Supported endpoints are ${allowedEndpoints.join(', ')}. '${input.endpoint}'' provided`);
  }

  return true;
}

const throwError = (message) => {
  throw new AdapterError({
    jobRunID: jobRunID,
    statusCode: 400,
    message,
    cause: {},
  });
}

const success = (data) => {
  return {
    jobRunID,
    data: data,
    result: data,
    statusCode: 200,
  }
}

const error = (message, code) => {
  return {
    jobRunID: jobRunID,
    status: "errored",
    statusCode: code,
    error: message
  }
}

const createRequest = async (input, callback) => {  // The Validator helps you validate the Chainlink request data
  jobRunID = input.id || 1; 
  input.endpoint = input.endpoint || 'add';
  const ipfs = ipfsClient.create(defaultIpfsOptions);
  
  try {
    validateInput(input)
  } catch (error) {
    return callback(400, error('Endpoint invalid', 400));
  }

  switch(input.endpoint) {
    case 'add': 
      try {
        const result = await ipfs.add(input.data);
        return callback(200, success(result));  
      } catch (error) {
        console.log("ERR", error);
        // return callback(error.statusCode || 500, Requester.errored(jobRunId, error, error.statusCode));
      };
      break;

    case 'get': 
      if ( !input.cid ) {
        return callback(400, error("Must provide CID", 400));
      }
      const contents = await toBuffer(ipfs.cat(input.cid));
      const file = JSON.parse(Buffer.from(contents.buffer).toString());
      return callback(200, success(file)); 
      break;
  }
}

// This is a wrapper to allow the function to work with
// GCP Functions
exports.gcpservice = (req, res) => {
  createRequest(req.body, (statusCode, data) => {
    res.status(statusCode).send(data)
  })
}

// This is a wrapper to allow the function to work with
// AWS Lambda
exports.handler = (event, context, callback) => {
  createRequest(event, (statusCode, data) => {
    callback(null, data)
  })
}

// This is a wrapper to allow the function to work with
// newer AWS Lambda implementations
exports.handlerv2 = (event, context, callback) => {
  createRequest(JSON.parse(event.body), (statusCode, data) => {
    callback(null, {
      statusCode: statusCode,
      body: JSON.stringify(data),
      isBase64Encoded: false
    })
  })
}

// This allows the function to be exported for testing
// or for running in express
module.exports.createRequest = createRequest
