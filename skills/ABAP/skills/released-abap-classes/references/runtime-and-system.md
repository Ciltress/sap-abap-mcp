# Runtime types, UUIDs and system information

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- Creating and Transforming UUIDs
- XCO Representations of SY Components
- Runtime Type Services (RTTS)
- Call Stack
- Exception Classes
- Getting the Current User Name
- Tenant Information
- Triggering Garbage Collection

---

## Creating and Transforming UUIDs

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_SYSTEM_UUID</code> </td>
<td>
Creating and converting system UUIDs with various algorithms 
<br><br>

``` abap
TRY.
    "----------- Creating UUIDs -----------

    "16 Byte System UUID in Binary Format
    "Example: 429A229A88021EDFB7E2E25DF99A8E73
    DATA(uuid_x16) = cl_system_uuid=>create_uuid_x16_static( ).

    "16 Byte System UUID in Base64
    "Example: GfeYceW27j{tuk9T{PgkSm
    DATA(uuid_c22) = cl_system_uuid=>create_uuid_c22_static( ).

    "16 Byte System UUID in Base32
    "Example: IKNCFGUIAIPN7N7C4JO7TGWOOM
    DATA(uuid_c26) = cl_system_uuid=>create_uuid_c26_static( ).

    "16 Byte System UUID in Hex Format
    "Example: 429A229A88021EDFB7E2E25DF99AEE73
    DATA(uuid_c32) = cl_system_uuid=>create_uuid_c32_static( ).

    "16 Byte System UUID in RFC4122 Format
    "Example: 429A229A-8802-1EDF-B7E2-E25DF99B0E73
    DATA(uuid_c36) = cl_system_uuid=>create_uuid_c36_static( ).

    "----------- Converting UUIDs -----------

    cl_system_uuid=>convert_uuid_x16_static(
      EXPORTING
        uuid     = uuid_x16
      IMPORTING
        uuid_c22 = DATA(x16_to_c22)
        uuid_c32 = DATA(x16_to_c32)
        uuid_c26 = DATA(x16_to_c26)
        uuid_c36 = DATA(x16_to_c36) ).

    cl_system_uuid=>convert_uuid_c22_static(
      EXPORTING
        uuid     = uuid_c22
      IMPORTING
        uuid_x16 = DATA(c22_to_x16)
        uuid_c32 = DATA(c22_to_c32)
        uuid_c26 = DATA(c22_to_c26)
        uuid_c36 = DATA(c22_to_c36) ).

    cl_system_uuid=>convert_uuid_c26_static(
      EXPORTING
        uuid     = uuid_c26
      IMPORTING
        uuid_x16 = DATA(c26_to_x16)
        uuid_c22 = DATA(c26_to_c22)
        uuid_c32 = DATA(c26_to_c32)
        uuid_c36 = DATA(c26_to_c36) ).

    cl_system_uuid=>convert_uuid_c32_static(
      EXPORTING
        uuid     = uuid_c32
      IMPORTING
        uuid_x16 = DATA(c32_to_x16)
        uuid_c22 = DATA(c32_to_c22)
        uuid_c26 = DATA(c32_to_c26)
        uuid_c36 = DATA(c32_to_c36) ).

    cl_system_uuid=>convert_uuid_c36_static(
      EXPORTING
        uuid     = uuid_c36
      IMPORTING
        uuid_x16 = DATA(c36_to_x16)
        uuid_c22 = DATA(c36_to_c22)
        uuid_c26 = DATA(c36_to_c26)
        uuid_c32 = DATA(c36_to_c32) ).

  CATCH cx_uuid_error INTO DATA(error).
    DATA(error_text) = error->get_text( ).
ENDTRY.
``` 

</td>
</tr>
<tr>
<td> <code>XCO_CP</code> <br> <code>XCO_CP_UUID</code> </td>
<td>
Creating UUIDs and transforming between different UUID formats using XCO
<br><br>

``` abap
"Creating UUIDs
"Type sysuuid_x16
DATA(x16_uuid) = xco_cp=>uuid( )->value.
"Other types using the 'as' method and providing a format
"Note that a data object of type string is returned when using the 'value' attribute.
DATA(c22_string) = xco_cp=>uuid( )->as( xco_cp_uuid=>format->c22 )->value.
DATA(c32_string) = xco_cp=>uuid( )->as( xco_cp_uuid=>format->c32 )->value.
DATA(c36_string) = xco_cp=>uuid( )->as( xco_cp_uuid=>format->c36 )->value.

"Tranforming between different formats
DATA(uuid_string_c36) = `429A229A-8802-1EDF-B7E2-E25DF99B0E73`.
DATA(uuid_string_c32) = `429A229A88021EDFB7E2E25DF99B0E73`.

DATA(uuid_x16) = xco_cp_uuid=>format->c36->to_uuid( uuid_string_c36 )->value.
ASSERT uuid_x16 = uuid_string_c32.

DATA(uuid_c32) = CONV sysuuid_c32( xco_cp_uuid=>format->c32->from_uuid( xco_cp_uuid=>format->c36->to_uuid( uuid_string_c36 ) ) ).
ASSERT uuid_c32 = uuid_string_c32.

uuid_x16 = xco_cp_uuid=>format->c32->to_uuid( uuid_string_c32 )->value.
ASSERT uuid_x16 = uuid_string_c32.

DATA(uuid_c36) = CONV sysuuid_c36( xco_cp_uuid=>format->c36->from_uuid( xco_cp_uuid=>format->c32->to_uuid( uuid_string_c32 ) ) ).
ASSERT uuid_c36 = uuid_string_c36.
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## XCO Representations of SY Components

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>XCO_CP</code> </td>
<td>

- Several `sy` components have XCO representations. 
- Find general information on XCO and more code snippets on the [SAP Help Portal](https://help.sap.com/docs/btp/sap-business-technology-platform/standard-library&version=Cloud&locale=en-US). 
- The following code snippet shows a selection of `sy` methods of the `XCO_CP` class. Some of the examples are also covered in other section of the cheat sheet.


```abap
"Currently, the following sy components are usable in ABAP for Cloud Development.
DATA(syindex) = sy-index.
DATA(sytabix) = sy-tabix.
DATA(sydbcnt) = sy-dbcnt.
DATA(syfdpos) = sy-fdpos.
DATA(sysubrc) = sy-subrc.
DATA(sylangu) = sy-langu.
DATA(sybatch) = sy-batch.
DATA(symandt) = sy-mandt.
DATA(sysysid) = sy-sysid.
DATA(syuname) = sy-uname.
DATA(symsgid) = sy-msgid.
DATA(symsgty) = sy-msgty.
DATA(symsgno) = sy-msgno.
DATA(symsgv1) = sy-msgv1.
DATA(symsgv2) = sy-msgv2.
DATA(symsgv3) = sy-msgv3.
DATA(symsgv4) = sy-msgv4.

"Others should not be used. For example, sy-datum.
"Some sy components have an XCO representation.
"The following example statements experiment with the API. To check out
"more methods and attributes, position the cursor after '->' or a closing
"parenthesis, and choose CTRL + Space.
"Note:
"- In many cases, importing parameters can be specified, e.g. to apply a
"  a specific format, etc..
"- Note the type when retrieving the value with the 'value' attribute.
"- Some excursions are included (i.e. extra functionality the API offers, such as
"  formatting options and other methods of xco_cp=>sy... that offer functionality
"  beyond sy components).
"- Some of the examples are also covered in other sections. More options are available
"  to handle the values. For example, you can perform date and time calculations with
"  the API.
"- Some of the examples use artifacts from the ABAP cheat sheet repository.

"Current user name
DATA(user) = xco_cp=>sy->user( )->name.

"Current date
"User time zone
"The example statements show different formats that can be applied. They can also be applied
"to other statements below, but they are not all covered.
"e.g. 2025-01-25
DATA(date_user_iso) = xco_cp=>sy->date( xco_cp_time=>time_zone->user )->as( xco_cp_time=>format->iso_8601_extended )->value.
"e.g. 20250125
DATA(date_user_iso_basic) = xco_cp=>sy->date( xco_cp_time=>time_zone->user )->as( xco_cp_time=>format->iso_8601_basic )->value.
DATA(date_user_abap) = xco_cp=>sy->date( xco_cp_time=>time_zone->user )->as( xco_cp_time=>format->abap )->value.
"UTC
DATA(date_utc_abap) = xco_cp=>sy->date( xco_cp_time=>time_zone->utc )->as( xco_cp_time=>format->abap )->value.

"Current time
"e.g. 09:23:40
DATA(date_time_iso) = xco_cp=>sy->time( xco_cp_time=>time_zone->user )->as( xco_cp_time=>format->iso_8601_extended )->value.
DATA(date_time_abap) = xco_cp=>sy->time( xco_cp_time=>time_zone->user )->as( xco_cp_time=>format->abap )->value.

"Excursion: Time stamp
"e.g. 2025-01-25T09:27:26
DATA(moment_user_iso) = xco_cp=>sy->moment( xco_cp_time=>time_zone->user )->as( xco_cp_time=>format->iso_8601_extended )->value.
"e.g. 20250125092726
DATA(moment_user_abap) = xco_cp=>sy->moment( xco_cp_time=>time_zone->user )->as( xco_cp_time=>format->abap )->value.
DATA(moment_utc_iso) = xco_cp=>sy->moment( xco_cp_time=>time_zone->utc )->as( xco_cp_time=>format->iso_8601_extended )->value.
DATA(moment_utc_abap) = xco_cp=>sy->moment( xco_cp_time=>time_zone->utc )->as( xco_cp_time=>format->abap )->value.
"Excursion: Unix time stamp
DATA(unix_time_stamp_abap) = xco_cp=>sy->unix_timestamp( )->value.

"Current language
"e.g. E
DATA(lang_value) = xco_cp=>sy->language( )->value.
"e.g. English
DATA(lang_name) = xco_cp=>sy->language( )->get_name( ).
"e.g. EN
DATA(lang_iso_639) = xco_cp=>sy->language( )->as( xco_cp_language=>format->iso_639 ).

"Handling messages
"Apart from retrieving msgid, msgty, msgv1, msgv2, msgv3, and msgv4 values of message
"objects, the examples experiment with other methods available.

"Creating a message object
DATA(msg) = xco_cp=>sy->message( ).

"Using the 'string' and 'as_message' methods to create message object
"based on a random string, and using a default type, id, etc.
"In the example, the created message object is assigned to the previous one
"work with in the example.
msg = xco_cp=>string( `Test message` )->as_message( ).

"The following data object is of type symsg.
DATA(msg_value) = msg->value.

"Using a message class from the ABAP cheat sheet repository
msg = msg->overwrite( iv_msgty = 'E'
                      iv_msgid = 'ZDEMO_ABAP_MESSAGES'
                      iv_msgno = '5'
                      iv_msgv1 = 'Some'
                      iv_msgv2 = 'error'
                      iv_msgv3 = 'text'
                      iv_msgv4 = '' ).

DATA(msg_val) = msg->value.
DATA(msgid) = msg_val-msgid.
DATA(msgty) = msg_val-msgty.
DATA(msgv1) = msg_val-msgv1.
DATA(msgv2) = msg_val-msgv2.
DATA(msgv3) = msg_val-msgv3.
DATA(msgv4) = msg_val-msgv4.
"Some error text
DATA(msg_text_a) = msg->get_text( ).
"E
DATA(msg_type) = msg->get_type( )->value.

msg = msg->place_string( iv_string = `example`
                         iv_msgv1  = abap_false
                         iv_msgv2  = abap_false
                         iv_msgv3  = abap_false
                         iv_msgv4  = abap_true ).

"Some error text example
DATA(msg_text_b) = msg->get_text( ).
"example
DATA(msgv4_b) = msg->value-msgv4.

DATA(err_obj) = NEW zcx_demo_abap_error_b( ).
msg->write_to_t100_dyn_msg( err_obj ).

TRY.
    RAISE EXCEPTION err_obj.
  CATCH zcx_demo_abap_error_b INTO DATA(error).
    "Some error text example
    DATA(error_text_a) = error->get_text( ).
ENDTRY.

"Converting a random string into a structured message
"using the 'string' method
xco_cp=>string( `Hello world` )->as_message( )->write_to_t100_dyn_msg( err_obj ).

TRY.
    RAISE EXCEPTION err_obj.
  CATCH zcx_demo_abap_error_b INTO error.
    "Hello world
    DATA(error_text_b) = error->get_text( ).
ENDTRY.

msg->overwrite( iv_msgty = 'E'
                iv_msgid = 'ZDEMO_ABAP_MESSAGES'
                iv_msgno = '5'
                iv_msgv1 = 'Another'
                iv_msgv2 = 'example'
                iv_msgv3 = 'error'
                iv_msgv4 = 'text' )->write_to_t100_dyn_msg( err_obj ).

TRY.
    RAISE EXCEPTION err_obj.
  CATCH zcx_demo_abap_error_b INTO error.
    "Another example error text
    DATA(error_text_c) = error->get_text( ).
ENDTRY.
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Runtime Type Services (RTTS)

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_ABAP_TYPEDESCR</code> </td>
<td>
RTTS represent a hierarchy of type description classes containing methods for:
<ul>
<li>getting type information on data objects, data types or instances at runtime (Runtime Type Identification (RTTI)).</li>
<li>defining and creating new data types as type description objects at runtime (Runtime Type Creation (RTTC)).</li>
</ul>

Apart from <code>CL_ABAP_TYPEDESCR</code>, there are the following classes available. The list shows the hierarchy of type description classes. The example shows a small selection. See also the dynamic programming cheat sheet.

<pre>
CL_ABAP_TYPEDESCR 
  | 
  |--CL_ABAP_DATADESCR 
  |   | 
  |   |--CL_ABAP_ELEMDESCR 
  |   |   | 
  |   |   |--CL_ABAP_ENUMDESCR 
  |   | 
  |   |--CL_ABAP_REFDESCR 
  |   |--CL_ABAP_COMPLEXDESCR 
  |       | 
  |       |--CL_ABAP_STRUCTDESCR 
  |       |--CL_ABAP_TABLEDESCR 
  | 
  |--CL_ABAP_OBJECTDESCR 
     | 
     |--CL_ABAP_CLASSDESCR 
     |--CL_ABAP_INTFDESCR 
</pre>


``` abap
TYPES elem_type TYPE c LENGTH 5.
DATA(tdo_elem) = CAST cl_abap_elemdescr(
    cl_abap_typedescr=>describe_by_name( 'ELEM_TYPE' ) ).
DATA(rel_name) = tdo_elem->get_relative_name( ).

TYPES reftype TYPE REF TO string.
DATA(dref) = NEW i( 123 ).
DATA(type_descr1) = cl_abap_typedescr=>describe_by_data_ref( dref ).
DATA(tdo_ref) = CAST cl_abap_refdescr(
    cl_abap_typedescr=>describe_by_name( 'REFTYPE' ) ).
DATA(type_descr2) = tdo_ref->get_referenced_type( ).

DATA structure TYPE zdemo_abap_carr.
DATA(tdo_struc) = CAST cl_abap_structdescr(
    cl_abap_typedescr=>describe_by_data( structure ) ).
DATA(abs_name) = tdo_struc->absolute_name.
DATA(struc_components) = tdo_struc->get_components( ).

DATA itab TYPE SORTED TABLE OF zdemo_abap_carr WITH UNIQUE KEY carrid.
DATA(tdo_itab) = CAST cl_abap_tabledescr(
    cl_abap_typedescr=>describe_by_data( itab ) ).
DATA(keys) = tdo_itab->get_keys( ).
DATA(tab_components) = CAST cl_abap_structdescr( tdo_itab->get_table_line_type( ) )->components.

DATA(tdo_oref) = CAST cl_abap_classdescr(
    cl_abap_typedescr=>describe_by_name( 'CL_ABAP_CLASSDESCR' ) ).
DATA(cl_methods) = tdo_oref->methods.
DATA(cl_attr) = tdo_oref->attributes.

DATA(tdo_iref) = CAST cl_abap_intfdescr(
    cl_abap_typedescr=>describe_by_name( 'ZDEMO_ABAP_OBJECTS_INTERFACE' ) ).
DATA(intf_methods) = tdo_iref->methods.
DATA(intf_attr) = tdo_iref->attributes.
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Call Stack

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>XCO_CP</code><br><code>XCO_CP_CALL_STACK</code> </td>
<td>
Getting the current ABAP call stack programmatically. See more information <a href="https://help.sap.com/docs/btp/sap-business-technology-platform/call-stack">here</a>.
<br><br>


``` abap
"Getting the full current call stack
DATA(call_stack) = xco_cp=>current->call_stack->full( ).

"Creating a format for the call stack
"In the example, an ADT debugger-like style is used
DATA(format) = xco_cp_call_stack=>format->adt(
  )->with_line_number_flavor( xco_cp_call_stack=>line_number_flavor->source ).

"Retrieving the full call stack as text, e.g. so that it can be output
"or written somewhere
DATA(call_stack_as_text) = call_stack->as_text( format ).

"Extracting the call stack based on specifications
"You can specify the extractions using from/to and
"further detailing out the kinds of extractions
"such as the position or the first/last occurrence
"of a specific line pattern.
"In the example, a line pattern is created (method that
"starts with a specific pattern). The extracting should
"go up to the last occurrence of this pattern. It is
"started at position 1.
DATA(line_pattern) = xco_cp_call_stack=>line_pattern->method(
  )->where_class_name_starts_with( 'CL_REST' ).
DATA(extracted_call_stack_as_text) = call_stack->from->position( 1
  )->to->last_occurrence_of( line_pattern )->as_text( format ).
``` 

</td>
</tr>

</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Exception Classes

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CX_*</code> </td>
<td>

Exception classes are special classes, usually starting with the name <code>CX_*</code>, that serve as the basis for <a href="https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abencatchable_exception_glosry.htm">catchable exceptions</a>. When an exception is raised, an object of such an exception class is created. There are several predefined exception classes. Find more information in the [Exceptions and Runtime Errors](27_Exceptions.md) cheat sheet. 

<br>

``` abap
TRY.
    DATA(res) = 1 / 0.
  CATCH cx_sy_zerodivide.
ENDTRY.

DATA(str_table) = VALUE string_table( ( `a` ) ( `b` ) ( `c` ) ).
TRY.
    DATA(table_entry) = str_table[ 4 ].
  CATCH cx_sy_itab_line_not_found.
ENDTRY.
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Getting the Current User Name

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>

<tr>
<td> <code>CL_ABAP_CONTEXT_INFO</code> </td>
<td>
Provides context information relevant to the current ABAP session.
<br><br>

``` abap
"User alias, e.g. XY0000001234
DATA(alias) = cl_abap_context_info=>get_user_alias( ).

"Formatted name, e.g. John Doe
TRY.
    DATA(formatted_name) = cl_abap_context_info=>get_user_formatted_name( ).
  CATCH cx_abap_context_info_error.
ENDTRY.

"The class also provides the option to retrieve the current date and time 
"in UTC.
"Getting the current date in UTC (not the system or user time), e.g. 20240101
DATA(sys_date) = cl_abap_context_info=>get_system_date( ).

"Getting the current time in UTC, e.g. 152450
DATA(sys_time) = cl_abap_context_info=>get_system_time( ).
``` 

</td>
</tr>

<tr>
<td> <code>XCO_CP</code> </td>
<td>

``` abap
DATA(user_w_xco) = xco_cp=>sy->user( )->name.
``` 

</td>
</tr>

</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Tenant Information

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>XCO_CP</code><br><code>XCO_CP_TENANT</code> </td>
<td>
For obtaining various information about the currently active tenant.
<br><br>

``` abap
"Getting a handler for the currently active tenant
DATA(ten) = xco_cp=>current->tenant( ).

"Getting the UI URL of the currently active tenant
DATA(ui_url) = ten->get_url( xco_cp_tenant=>url_type->ui ).

"Protocol
"e.g. https
DATA(prot) = ui_url->get_protocol( ).
"Host and domain
"e.g. abcde-...-com
DATA(host) = ui_url->get_host( ).
"Port
"e.g. 443
DATA(port) = ui_url->get_port( ).

"Global account ID
DATA(global_acc_id) = ten->get_global_account_id( )->as_string( ).
"Guid
DATA(guid) = ten->get_guid( )->value.
"Id
DATA(id) = ten->get_id( ).
"Subaccount ID
DATA(sub_acc_id) = ten->get_subaccount_id( )->as_string( ).
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Triggering Garbage Collection

- The `CL_ABAP_GARBAGE_COLLECTOR` class provides the `collect` method. 
- Calling this method manually triggers garbage collection, regardless of current memory consumption or the garbage collector's state.  
- The ABAP runtime framework periodically invokes the [garbage collector](https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abengarbage_collector_glosry.htm), so it is generally unnecessary to trigger clearing explicitly. However, doing so can be beneficial in exceptional cases, such as when large, unnecessary objects consume significant memory or when explicit memory release is needed in resource-constrained environments. It can also help analyze memory usage and ensure proper memory release.

<br>

```abap
cl_abap_garbage_collector=>collect( ).
``` 


<p align="right"><a href="#top">⬆️ back to top</a></p>
