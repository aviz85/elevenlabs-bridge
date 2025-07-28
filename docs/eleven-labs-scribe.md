ENDPOINTS
Speech to Text
Create transcript
POST

https://api.elevenlabs.io
/v1/speech-to-text
POST
/v1/speech-to-text

TypeScript

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
const client = new ElevenLabsClient({ apiKey: "YOUR_API_KEY" });
await client.speechToText.convert({
    modelId: "model_id"
});
Try it

200
Single channel response

{
  "language_code": "en",
  "language_probability": 0.98,
  "text": "Hello world!",
  "words": [
    {
      "text": "Hello",
      "start": 0,
      "end": 0.5,
      "type": "word",
      "speaker_id": "speaker_1",
      "logprob": -0.124
    }
  ]
}
Transcribe an audio or video file. If webhook is set to true, the request will be processed asynchronously and results sent to configured webhooks. When use_multi_channel is true and the provided audio has multiple channels, a ‘transcripts’ object with separate transcripts for each channel is returned. Otherwise, returns a single transcript.

Headers
xi-api-key
string
Required
Query parameters
enable_logging
boolean
Optional
Defaults to true
When enable_logging is set to false zero retention mode will be used for the request. This will mean history features are unavailable for this request, including request stitching. Zero retention mode may only be used by enterprise customers.

Request
This endpoint expects a multipart form containing an optional file.
model_id
string
Required
The ID of the model to use for transcription, currently only ‘scribe_v1’ and ‘scribe_v1_experimental’ are available.

file
file
Optional
The file to transcribe. All major audio and video formats are supported. Exactly one of the file or cloud_storage_url parameters must be provided. The file size must be less than 1GB.

language_code
string or null
Optional
An ISO-639-1 or ISO-639-3 language_code corresponding to the language of the audio file. Can sometimes improve transcription performance if known beforehand. Defaults to null, in this case the language is predicted automatically.

tag_audio_events
boolean
Optional
Defaults to true
Whether to tag audio events like (laughter), (footsteps), etc. in the transcription.

num_speakers
integer or null
Optional
>=1
<=32
The maximum amount of speakers talking in the uploaded file. Can help with predicting who speaks when. The maximum amount of speakers that can be predicted is 32. Defaults to null, in this case the amount of speakers is set to the maximum value the model supports.
timestamps_granularity
enum
Optional
Defaults to word
The granularity of the timestamps in the transcription. ‘word’ provides word-level timestamps and ‘character’ provides character-level timestamps per word.

Allowed values:
none
word
character
diarize
boolean
Optional
Defaults to false
Whether to annotate which speaker is currently talking in the uploaded file.
diarization_threshold
double or null
Optional
>=0.1
<=0.4
Diarization threshold to apply during speaker diarization. A higher value means there will be a lower chance of one speaker being diarized as two different speakers but also a higher chance of two different speakers being diarized as one speaker (less total speakers predicted). A low value means there will be a higher chance of one speaker being diarized as two different speakers but also a lower chance of two different speakers being diarized as one speaker (more total speakers predicted). Can only be set when diarize=True and num_speakers=None. Defaults to None, in which case we will choose a threshold based on the model_id (0.22 usually).

additional_formats
list of objects
Optional
A list of additional formats to export the transcript to.

Show 6 variants
file_format
enum
Optional
Defaults to other
The format of input audio. Options are ‘pcm_s16le_16’ or ‘other’ For pcm_s16le_16, the input audio must be 16-bit PCM at a 16kHz sample rate, single channel (mono), and little-endian byte order. Latency will be lower than with passing an encoded waveform.

Allowed values:
pcm_s16le_16
other
cloud_storage_url
string or null
Optional
The valid AWS S3, Cloudflare R2 or Google Cloud Storage URL of the file to transcribe. Exactly one of the file or cloud_storage_url parameters must be provided. The file must be a valid publicly accessible cloud storage URL. The file size must be less than 2GB. URL can be pre-signed.

webhook
boolean
Optional
Defaults to false
Whether to send the transcription result to configured speech-to-text webhooks. If set the request will return early without the transcription, which will be delivered later via webhook.

webhook_id
string or null
Optional
Optional specific webhook ID to send the transcription result to. Only valid when webhook is set to true. If not provided, transcription will be sent to all configured speech-to-text webhooks.

temperature
double or null
Optional
>=0
<=2
Controls the randomness of the transcription output. Accepts values between 0.0 and 2.0, where higher values result in more diverse and less deterministic results. If omitted, we will use a temperature based on the model you selected which is usually 0.
seed
integer or null
Optional
>=0
<=2147483647
If specified, our system will make a best effort to sample deterministically, such that repeated requests with the same seed and parameters should return the same result. Determinism is not guaranteed. Must be an integer between 0 and 2147483647.
use_multi_channel
boolean
Optional
Defaults to false
Whether the audio file contains multiple channels where each channel contains a single speaker. When enabled, each channel will be transcribed independently and the results will be combined. Each word in the response will include a ‘channel_index’ field indicating which channel it was spoken on. A maximum of 5 channels is supported.

Response
Synchronous transcription result
SpeechToTextChunkResponseModel
object

Show 6 properties
OR
MultichannelSpeechToTextResponseModel
object

Show 1 properties
OR
SpeechToTextChunkResponseModel
object

Show 6 properties
OR
MultichannelSpeechToTextResponseModel
object

Show 1 properties
OR
any
Errors

422
Unprocessable Entity Error
Was this page helpful?
Yes
