---
name: released-abap-classes
description: Find released ABAP classes for ABAP Cloud Development. Use when user asks about ABAP classes for specific functionality like email, UUID generation, time/date handling, JSON/XML processing, RAP, string processing, random numbers, regex, Base64, HTTP calls, unit testing, PDF rendering, parallel processing, application logs, or any other ABAP Cloud class lookup.
---

# Released ABAP Classes

Reference for released ABAP classes available in ABAP for Cloud Development (SAP BTP ABAP Environment).

## Quick Reference by Category

| Category | Key Classes |
|----------|-------------|
| **Console Output** | `IF_OO_ADT_CLASSRUN`, `CL_DEMO_CLASSRUN`, `CL_XCO_CP_ADT_SIMPLE_CLASSRUN` |
| **UUID** | `CL_SYSTEM_UUID`, `XCO_CP`, `XCO_CP_UUID` |
| **Time & Date** | `CL_ABAP_CONTEXT_INFO`, `XCO_CP_TIME`, `CL_ABAP_TSTMP`, `CL_ABAP_UTCLONG`, `CL_ABAP_DATFM`, `CL_ABAP_TIMEFM` |
| **Calendar** | `CL_FHC_CALENDAR_RUNTIME`, `CL_SCAL_UTILS` |
| **String Processing** | `CL_ABAP_CHAR_UTILITIES`, `CL_ABAP_STRING_UTILITIES`, `XCO_CP` |
| **Numbers/Math** | `CL_ABAP_MATH`, `CL_ABAP_DECFLOAT`, `CL_ABAP_BIGINT`, `CL_ABAP_RATIONAL` |
| **Random Numbers** | `CL_ABAP_RANDOM_*` (INT, INT8, FLOAT, PACKED, DECFLOAT16/34), `CL_ABAP_PROB_DISTRIBUTION` |
| **Regular Expressions** | `CL_ABAP_REGEX`, `CL_ABAP_MATCHER` |
| **Codepage/Binary** | `CL_ABAP_CONV_CODEPAGE`, `CL_ABAP_GZIP*`, `CL_WEB_HTTP_UTILITY` |
| **JSON/XML** | `XCO_CP_JSON`, `/UI2/CL_JSON`, `CL_SXML_*`, `CL_IXML_*` |
| **Email** | `CL_BCS_MAIL_MESSAGE` |
| **HTTP Calls** | `CL_WEB_HTTP_CLIENT_MANAGER`, `CL_HTTP_DESTINATION_PROVIDER` |
| **RAP** | `CL_ABAP_BEHV_AUX`, `CL_ABAP_BEHAVIOR_HANDLER`, `CL_ABAP_BEHAVIOR_SAVER` |
| **RTTS** | `CL_ABAP_TYPEDESCR` and hierarchy |
| **Dynamic Programming** | `CL_ABAP_DYN_PRG`, `CL_ABAP_CORRESPONDING` |
| **User Info** | `CL_ABAP_CONTEXT_INFO`, `XCO_CP=>sy->user()` |
| **Unit Testing** | `CL_ABAP_UNIT_ASSERT`, `CL_OSQL_TEST_ENVIRONMENT`, `CL_CDS_TEST_ENVIRONMENT` |
| **Parallel Processing** | `CL_ABAP_PARALLEL` |
| **Application Log** | `CL_BALI_LOG` |
| **Background Jobs** | `CL_BGMC_PROCESS_FACTORY` |
| **Locking** | `CL_ABAP_LOCK_OBJECT_FACTORY` |
| **XLSX** | `XCO_CP_XLSX` |
| **Zip Files** | `CL_ABAP_ZIP` |
| **PDF Rendering** | `CL_FP_ADS_UTIL` |

## Common Use Cases

### Get Current Date/Time in UTC
```abap
"Using CL_ABAP_CONTEXT_INFO
DATA(sys_date) = cl_abap_context_info=>get_system_date( ).  "e.g. 20240101
DATA(sys_time) = cl_abap_context_info=>get_system_time( ).  "e.g. 152450

"Using XCO (various formats)
DATA(date_utc) = xco_cp=>sy->date( xco_cp_time=>time_zone->utc )->as( xco_cp_time=>format->abap )->value.
DATA(time_utc) = xco_cp=>sy->time( xco_cp_time=>time_zone->utc )->as( xco_cp_time=>format->iso_8601_extended )->value.
DATA(moment_utc) = xco_cp=>sy->moment( xco_cp_time=>time_zone->utc )->as( xco_cp_time=>format->iso_8601_extended )->value.
```

### Send Email
```abap
TRY.
    DATA(mail) = cl_bcs_mail_message=>create_instance( ).
    mail->set_sender( 'sender@example.com' ).
    mail->add_recipient( 'recipient@example.com' ).
    mail->set_subject( 'Subject' ).
    mail->set_main( cl_bcs_mail_textpart=>create_instance(
      iv_content      = '<h1>Hello</h1><p>Message body.</p>'
      iv_content_type = 'text/html' ) ).
    mail->send( IMPORTING et_status = DATA(status) ).
  CATCH cx_bcs_mail INTO DATA(error).
ENDTRY.
```

### Generate UUID
```abap
"CL_SYSTEM_UUID
DATA(uuid_x16) = cl_system_uuid=>create_uuid_x16_static( ).
DATA(uuid_c36) = cl_system_uuid=>create_uuid_c36_static( ).

"XCO
DATA(uuid) = xco_cp=>uuid( )->value.
DATA(uuid_c36_xco) = xco_cp=>uuid( )->as( xco_cp_uuid=>format->c36 )->value.
```

### JSON Processing
```abap
"ABAP -> JSON
DATA(json) = xco_cp_json=>data->from_abap( some_structure )->to_string( ).

"JSON -> ABAP
xco_cp_json=>data->from_string( json_string )->write_to( REF #( target_structure ) ).

"Using /UI2/CL_JSON
DATA(json2) = /ui2/cl_json=>serialize( data = some_data ).
/ui2/cl_json=>deserialize( EXPORTING json = json2 CHANGING data = target ).
```

### HTTP Client Call
```abap
TRY.
    DATA(dest) = cl_http_destination_provider=>create_by_url( 'https://api.example.com' ).
    DATA(client) = cl_web_http_client_manager=>create_by_http_destination( dest ).
    DATA(request) = client->get_http_request( ).
    DATA(response) = client->execute( if_web_http_client=>get ).
    DATA(status) = response->get_status( ).
    DATA(body) = response->get_text( ).
  CATCH cx_web_http_client_error cx_http_dest_provider_error INTO DATA(error).
ENDTRY.
```

### Get Current User
```abap
"Using CL_ABAP_CONTEXT_INFO
DATA(user_alias) = cl_abap_context_info=>get_user_alias( ).
DATA(user_name) = cl_abap_context_info=>get_user_formatted_name( ).

"Using XCO
DATA(user) = xco_cp=>sy->user( )->name.
```

## Detailed Reference

The cheat sheet is split by topic so you read one, not all of it. **Ask for a single file** — through
this server, `readSkill` with `{"skill":"released-abap-classes","file":"references/<name>"}`. The full
set is ~110k tokens; no task needs it.

Everything above is usually enough on its own: the quick reference names the class, and
`readAbapObject` proves whether it exists on your system. Open a topic file when you need the calling
sequence or a worked example.

| Topic | File | Size |
| --- | --- | --- |
| Console output, ABAP Cloud availability | `references/getting-started.md` | ~2k |
| RAP handlers, savers, transactional consistency | `references/rap.md` | ~2k |
| Numbers, arithmetic, decimal handling | `references/numbers.md` | ~5k |
| Strings, codepages, binary data, regular expressions | `references/strings-and-regex.md` | ~6k |
| Internal tables, structure components, dynamic programming | `references/internal-tables.md` | ~3k |
| Units of measurement | `references/units-of-measurement.md` | ~3k |
| Time, date, time zones, factory calendars | `references/time-and-date.md` | ~4k |
| UUIDs, XCO `SY`, RTTS, call stack, exceptions, current user, tenant | `references/runtime-and-system.md` | ~5k |
| XML and JSON | `references/xml-json.md` | ~2k |
| Repairing and cleaning up HTML/XML documents | `references/html-cleanup.md` | ~5k |
| ZIP, CSV, PDF rendering | `references/files-and-output.md` | ~3k |
| Transport requests, releasing APIs | `references/transport-and-release.md` | ~4k |
| ABAP Unit, programmatic ATC | `references/testing-and-atc.md` | ~1k |
| Parallel and background processing | `references/background-processing.md` | ~4k |
| Application jobs | `references/application-jobs.md` | ~5k |
| Application log, locking, number ranges | `references/logging-and-locking.md` | ~2k |
| HTTP calls, destinations, email, generative AI | `references/integration.md` | ~5k |
| Spreadsheets (XLSX) | `references/spreadsheets.md` | **~8k** |
| Reading and generating repository objects | `references/repository-objects.md` | **~10k** |
| Creating and using IDE actions | `references/ide-actions.md` | **~30k** |

The last three are single, indivisible topics and are large. A server running a small profile may
refuse them for exceeding its response budget — that is not an error to retry, it means the topic is
genuinely too big for that client. Ask on a larger profile, or work from the quick reference above.

> The cheat sheet is not comprehensive, and the snippets show syntax rather than production error
> handling. Where several classes achieve the same thing it does not always say which to prefer. For
> XCO it covers the released APIs only.

---

## Using the ABAP ADT MCP server

When an ADT connection is available, verify rather than assume:

| Step | Tool |
| --- | --- |
| Does the class exist on **this** system, and in which package | `readAbapObject` with `includeSource:false` |
| Find candidates by pattern | `searchObject` (a trailing `*` is added when you pass none) |
| What is in a package | `searchPackages` |
| Its ABAP Doc | `abapDocumentation` |

Release state is per system and per release, so a class appearing in the reference list does not prove
it is available where you are deploying. `readAbapObject` returning the object is the proof.

These tools take object **names**, not ADT URLs - `readAbapObject` resolves the name, the
structure and the source in one call. For the full reference call `readServerGuide`
with `{"guide":"tools"}`, which is this server's own documentation.
