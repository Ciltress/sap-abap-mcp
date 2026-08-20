# XML and JSON

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- XML/JSON

---

## XML/JSON

<table>
<tr>
<td> Class </td> <td> Details </td>
</tr>
<tr>
<td> <code>CL_IXML_*</code> <br> <code>CL_SXML_*</code> </td>
<td>
<ul>
<li>The processing of XML can be done using class libraries such as the Integrated XML Library (iXML) and the Serial XML Library (sXML).</li>
<li>In iXML, you need input and output streams that are created using iXML methods to access XML data.</li>
<li>sXML provides XML readers and writers for different sources and targets to process XML data sequentially. JSON can also be handled.</li>
<li>For more information and code snippets, you can refer to the ABAP Keyword Documentation and the XML/JSON cheat sheet.</li>
</ul>
<br>

```abap
"As mentioned, refer to the ABAP Keyword Documentation and the 
"XML/JSON cheat sheet (and executable example) for examples

"Creating an XML writer using sXML
DATA(writer) = CAST if_sxml_writer( cl_sxml_string_writer=>create( type     = if_sxml=>co_xt_xml10
                                                                   encoding = 'UTF-8' ) ).

"The above writer uses a cast to if_sxml_writer. In doing so,
"more special methods can be accessed. You can check it by adding
"the object component selector (->) behind the closing parenthesis.
"Plus: The example above specifies the default parameters
"explicitly. Here, they are omitted. You can also create a JSON
"writer.
DATA(writer2) = cl_sxml_string_writer=>create(  ).

... "Creating some XML data

"Creating an XML reader using sXML
"Note: Similar to the writer, the interface IF_SXML_READER exists
"for readers. 
DATA(reader) = cl_sxml_string_reader=>create( some_xml ).

... "Reading XML data sequentially
```

</td>
</tr>
<tr>
<td> <code>XCO_CP_JSON</code> </td>
<td>
Handling JSON data using the XCO library
<br><br>

``` abap
"Creating and populating a demo structure and internal table
DATA: BEGIN OF carrier_struc,
        carrier_id    TYPE c length 3,
        connection_id TYPE n length 4,
        city_from TYPE c length 20,
        city_to TYPE c length 20,
      END OF carrier_struc.

DATA carriers_tab LIKE TABLE OF carrier_struc WITH EMPTY KEY.

carrier_struc = VALUE #( carrier_id = 'AA' connection_id = '17' city_from = 'New York' city_to = 'San Francisco' ).
carriers_tab = VALUE #( ( carrier_id = 'AZ' connection_id = '788' city_from = 'Rome' city_to = 'Tokyo' )
                        ( carrier_id = 'JL' connection_id = '408' city_from = 'Frankfurt' city_to = 'Tokyo' ) ).

"ABAP (structure) -> JSON using XCO
DATA(struc2json_xco) = xco_cp_json=>data->from_abap( carrier_struc )->to_string( ).
"Result: {"CARRIER_ID":"AA","CONNECTION_ID":"0017","CITY_FROM":"New York","CITY_TO":"San Francisco"}

"ABAP (internal table) -> JSON using XCO
DATA(itab2json_xco) = xco_cp_json=>data->from_abap( carriers_tab )->to_string( ).
"Result: [{"CARRIER_ID":"AZ","CONNECTION_ID":"0788","CITY_FROM":"Rome","CITY_TO":"Tokyo"},
"         {"CARRIER_ID":"JL","CONNECTION_ID":"0408","CITY_FROM":"Frankfurt","CITY_TO":"Tokyo"}]

"JSON -> ABAP (structure) using XCO
DATA json2struc_xco LIKE carrier_struc.
xco_cp_json=>data->from_string( struc2json_xco )->write_to( REF #( json2struc_xco ) ).
"Result:
"CARRIER_ID    CONNECTION_ID    CITY_FROM    CITY_TO
"AA            0017             New York     San Francisco

"JSON -> ABAP (internal table) using XCO
DATA json2itab_xco LIKE carriers_tab.
xco_cp_json=>data->from_string( itab2json_xco )->write_to( REF #( json2itab_xco ) ).
"Result:
"CARRIER_ID    CONNECTION_ID    CITY_FROM    CITY_TO
"AZ            0788             Rome         Tokyo
"JL            0408             Frankfurt    Tokyo

"Creating JSON using XCO
"You can check out more methods that offer various options to build
"the JSON by clicking CTRL + Space after '->' in ADT.
"In the following example, JSON data similar to above is created.
"First, a JSON data builder is created. Then, using different methods,
"JSON data is created.
DATA(json_builder_xco) = xco_cp_json=>data->builder( ).
json_builder_xco->begin_object(
  )->add_member( 'CarrierId' )->add_string( 'DL'
  )->add_member( 'ConnectionId' )->add_string( '1984'
  )->add_member( 'CityFrom' )->add_string( 'San Francisco'
  )->add_member( 'CityTo' )->add_string( 'New York'
  )->end_object( ).

"Getting JSON data
DATA(json_created_xco) = json_builder_xco->get_data( )->to_string( ).
"Result: {"CarrierId":"DL","ConnectionId":"1984","CityFrom":"San Francisco","CityTo":"New York"}

"Transforming the created JSON to ABAP (structure)
"Note: The JSON was intentionally created without the underscores in the
"name to demonstrate the 'apply' method. The following example demonstrates
"a transformation of camel case and underscore notation. As above, check out
"more options by clicking CTRL + Space after '...transformation->'.
CLEAR json2struc_xco.
xco_cp_json=>data->from_string( json_created_xco )->apply( VALUE #(
  ( xco_cp_json=>transformation->pascal_case_to_underscore ) ) )->write_to( REF #( json2struc_xco ) ).
"Result
"CARRIER_ID    CONNECTION_ID    CITY_FROM        CITY_TO
"DL            1984             San Francisco    New York
``` 

</td>
</tr>
<tr>
<td> <code>/UI2/CL_JSON</code> </td>
<td>

- Handling JSON data using the <code>/UI2/CL_JSON</code> class
- Note that there are many additional and optional parameters available, some of which are explored in examples in the [Working with XML and JSON in ABAP](21_XML_JSON.md) cheat sheet.


<br>

```abap
DATA(some_table) = VALUE string_table( ( `aaa` ) ( `bbb` ) ( `ddd` ) ).

"--------- ABAP -> JSON ---------
DATA(abap_to_json) = /ui2/cl_json=>serialize( data = some_table ).

"--------- JSON -> ABAP ---------
DATA table_json_to_abap TYPE string_table.
/ui2/cl_json=>deserialize( EXPORTING json = abap_to_json
                           CHANGING data  = table_json_to_abap ).
```

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>
