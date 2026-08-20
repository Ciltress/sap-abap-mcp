# Spreadsheets (XLSX)

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- Reading and Writing XLSX Content

---

## Reading and Writing XLSX Content

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>XCO_CP_XLSX</code> </td>
<td>

The XCO library offers classes such as `XCO_CP_XLSX` and methods for reading and writing XLSX content. You can find more information [here](https://help.sap.com/docs/btp/sap-business-technology-platform/xlsx). The following example demonstrates a selection of methods.

Expand the following collapsible sections for further information and example code.

<details>
  <summary>🟢 Click to expand for more information and example code</summary>
  <!-- -->
<br>

The following example demonstrates a selection of methods and includes the following steps:

- Importing existing XLSX content into your SAP BTP ABAP Environment system (not related to the XCO library; just to have content to work with in the self-contained example below)
  - This is a simplified, nonsemantic, and explorative RAP example (not delving into RAP as such; just using various ABAP repository objects related to RAP) solely for importing XLSX content to work with in the example.   
  - The import is done using an automatically created SAP Fiori Elements app preview, which provides a simple UI for uploading local XLSX content.
  - The repository objects are automatically created in ADT when walking through a wizard. Refer to the prerequisite steps for details.
- Reading XLSX content into an internal table using XCO
- Writing XLSX content using XCO based on internal table content
  - A demo class explores a selection of XCO classes and methods. 
- Exporting the adapted XLSX content (not related to the XCO library; just to visualize newly created XLSX content using XCO)

> [!NOTE]  
> - Note [this repository's disclaimer](./README.md#%EF%B8%8F-disclaimer) and [the disclaimer in the documentation about XCO](https://help.sap.com/docs/btp/sap-business-technology-platform/xlsx-read-access) for security considerations when importing and processing external content.
> - IDE actions represent a simple way of file import. Find more information in section [Excursion: Exploring Demo Display Class Using IDE Actions](#excursion-exploring-demo-display-class-using-ide-actions).


**Prerequisite Steps for the XLSX Content Import into the SAP BTP ABAP Environment**

The XLSX XCO module works with XLSX content in the form of an xstring. The following example assumes that you have XLSX content available as xstring. To try out the example, you can proceed as follows: 


- In your ABAP Cloud project in ADT, create a database table in the desired target package. This example uses the name `ztdemo_abap_xlsx`. 
- Give it a description, such as *Demo table*, and assign it to a transport. 
- Set up the example database table as follows:

  ```abap
  @EndUserText.label : 'Demo table'
  @AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
  @AbapCatalog.tableCategory : #TRANSPARENT
  @AbapCatalog.deliveryClass : #A
  @AbapCatalog.dataMaintenance : #RESTRICTED
  define table ztdemo_abap_xlsx {

    key client            : abap.clnt not null;
    key id                : sysuuid_x16 not null;
    file_content          : abap.rawstring(0);
    file_name             : abap.char(128);
    file_mimetype         : abap.char(128);
    @AbapCatalog.anonymizedWhenDelivered : true
    local_created_by      : abp_creation_user;
    local_created_at      : abp_creation_tstmpl;
    @AbapCatalog.anonymizedWhenDelivered : true
    local_last_changed_by : abp_locinst_lastchange_user;
    local_last_changed_at : abp_locinst_lastchange_tstmpl;
    last_changed_at       : abp_lastchange_tstmpl;

  }
  ```

- Activate the database table.
- In the *Project Explorer* view on the left, locate your created database table and right-click on it. Choose *Generate ABAP Repository Objects...* from the top section of the context menu.
- This opens the *Generate ABAP Repository Objects* dialog box. 
- Select *OData UI Service*. Find information on the right about the RAP-specific repository objects to be created. These objects include CDS entities, BDEFs, ABPs, service definition and binding, among others.
- Choose *Next*.
- Select the package and choose *Next*.
- The next screen in the dialog box lets you specify additional details for RAP repository objects, such as alias names. However, you can also leave it as is and choose *Next*. 
- The following screen displays a list of artifacts set to be created. Choose *Next*. 
- Then, select the transport request and choose *Finish*. 
- The creation of the repository objects may take some time. Once completed, the service binding will appear. Keep it open, but refrain from making any adjustments at this point. 
- Proceed to access the generated CDS entity. Note that two CDS entities are created. Access the one **without** the *with projection on* specification (the example entity name is  `ZR_TDEMO_ABAP_XLSX`). The specification appears as follows.
  ```abap
  ...
  define root view entity ZR_TDEMO_ABAP_XLSX
    as select from ZTDEMO_ABAP_XLSX
  ...  
  ```
- Adapt the CDS entity as follows. It is essential that the `@Semantics` annotations are specified and the provided names match. 
  ```abap
  @AccessControl.authorizationCheck: #NOT_REQUIRED
  @Metadata.allowExtensions: true
  @EndUserText.label: 'Demo CDS Entity'
  define root view entity ZR_TDEMO_ABAP_XLSX
    as select from ztdemo_abap_xlsx
  {
    key id                as Id,
    @Semantics.largeObject: { mimeType: 'FileMimetype',
                              fileName: 'FileName',
                              contentDispositionPreference: #ATTACHMENT }
    file_content          as FileContent,
    file_name             as FileName,
    @Semantics.mimeType: true
    file_mimetype         as FileMimetype,
    @Semantics.user.createdBy: true
    @UI.hidden
    local_created_by      as LocalCreatedBy,
    @Semantics.systemDateTime.createdAt: true
    @UI.hidden
    local_created_at      as LocalCreatedAt,
    @Semantics.user.localInstanceLastChangedBy: true
    @UI.hidden
    local_last_changed_by as LocalLastChangedBy,
    @Semantics.systemDateTime.localInstanceLastChangedAt: true
    @UI.hidden
    local_last_changed_at as LocalLastChangedAt,
    @Semantics.systemDateTime.lastChangedAt: true
    @UI.hidden
    last_changed_at       as LastChangedAt

  }
  ```
- Activate the CDS entity.
- Return to the service binding located in your package under *Business Services -> Service Bindings* (e.g.  `ZUI_TDEMO_ABAP_XLSX_O4`).
- Choose the *Publish* button for the *Local Service Endpoint*. The publishing may take some time.
- After publishing, locate the *Service Version Details* section on the right. Under *Entity Set and Association*, right-click the newly created entity set and select *Open Fiori Elements App Preview*.
- This action opens the SAP Fiori Elements app in a new browser window.
- Within the app, choose the *Create* button.
- You should see a *Browse* button in the *FileContent* field.
- Choose this button and select a local XLSX file. Note: You can use the example XLSX content provided below. Only with this content does the example class work properly. For your own explorations, adapt the class code accordingly.
- After uploading the file, choose *Create* at the bottom to save the entry.
- Refer to the comments in the example class below. You can either exit the app now, leaving one entry in the database with the XLSX content, or use the UUID value of the created entry in the `WHERE` clause of the `SELECT` statement at the beginning of the `main` method implementation below.


> [!NOTE]  
> - If there are issues with the UI (e.g. you cannot upload), try out UI V2.
> - Create a new service definition, e.g. right-click the *Service Definition* folder and choose *New Service Definition*. 
> - Provide a name (e.g. `ZUI_TDEMO_ABAP_XLSX_O2`) and description. Choose *Next*.
> - The code should look as follows:
>   ```abap
>   @EndUserText.label: 'Service Definition'
>   define service ZUI_TDEMO_ABAP_XLSX_O2
>    provider contracts odata_v2_ui {
>     expose ZC_TDEMO_ABAP_XLSX;
>   }
>   ```
> - Activate it and create a new service binding, e.g. by right-clicking the service definition and choosing *New Service Binding*.
> - Create the binding (e.g. with the same name as the service definition `ZUI_TDEMO_ABAP_XLSX_O2`), and select *OData V2 - UI* as *Binding Type*.
> - Activate and publish the local service endpoint.
> - Access the preview app as described above.

> **📝 Example XLSX content**<br>
>- Copy and paste the following data into your demo XLSX file. The example only uses simple character-like values. Note the information in the documentation about value transformation when processing the XLSX content.
>- Your XLSX creation program may have a feature, such as *text to column*, that can help you divide the text into separate columns. In this case, the first four columns are filled.  
>- The delimiter is a comma, indicating that there are four columns to be filled with the demo data. 
>- Name the first worksheet (where you insert the demo data) `Sheet1`.
> ``` 
>AA,American Airlines,USD,http://www.aa.com
>AC,Air Canada,CAD,http://www.aircanada.ca
>AF,Air France,EUR,http://www.airfrance.fr
>BA,British Airways,GBP,http://www.british-airways.com
>CO,Continental Airlines,USD,http://www.continental.com
>DL,Delta Airlines,USD,http://www.delta-air.com
>LH,Lufthansa,EUR,http://www.lufthansa.com
>JL,Japan Airlines,JPY,http://www.jal.co.jp
>NW,Northwest Airlines,USD,http://www.nwa.com
>QF,Qantas Airways,AUD,http://www.qantas.com.au
>SA,South African Air.,ZAR,http://www.saa.co.za
>SQ,Singapore Airlines,SGD,http://www.singaporeair.com
>SR,Swiss,CHF,http://www.swiss.com
>UA,United Airlines,USD,http://www.ual.com
>```

**Exploring the XCO XLSX Module**

Assuming you have the XLSX content created and uploaded above on your system, you can explore the following example using the XCO classes/methods. Set up a demo class called `zcl_demo_abap` and use the code provided below. After activating it, choose *F9* in ADT to run the class. The example is designed to show output in the console. 

> [!NOTE]  
> - Refer to the comments in the code for information.
> - If you have used different names than those in this example, make sure to replace those names in the code.
> - If your artifacts have a different setup, names, or XLSX content, the example class will not function properly. You willl need to modify the class code to match your specific requirements.

```abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
  PROTECTED SECTION.
  PRIVATE SECTION.

ENDCLASS.



CLASS zcl_demo_abap IMPLEMENTATION.


  METHOD if_oo_adt_classrun~main.

    "As a prerequisite, you have walked through the steps mentioned. RAP repository objects
    "were created, adapted as mentioned, and activated. You have at least one XLSX file imported
    "using the preview app. XLSX content is available in the database table as xstring.
    "--------------------------------------- NOTE ----------------------------------------
    "------ This is only intended for demonstration purposes!! Do note the security ------
    "------ aspects etc. when importing external content. The focus of this example ------
    "------ is to explore the XCO XLSX  module. ------------------------------------------

    "The SELECT statement assumes there is one entry available. Otherwise, adapt the
    "statement accordingly, e.g. by adding a WHERE clause and providing the UUID you can
    "copy for a created entry in the Fiori Elements preview app. Note the XCO class with
    "which to transform the UUID. Replace the dummy UUID.
    SELECT SINGLE id, file_content FROM ztdemo_abap_xlsx
    "WHERE id = @( CONV sysuuid_c32(
    " xco_cp_uuid=>format->c32->from_uuid( xco_cp_uuid=>format->c36->to_uuid( 'a1a2a3a4-b1b2-c1c2-d3d4-e5e6e7e8e9e0' ) ) ) )
    INTO @DATA(xlsx).

    IF sy-subrc <> 0 OR xlsx-file_content IS INITIAL.
      out->write( `No XLSX content available to work with` ).
      RETURN.
    ENDIF.

    out->write( `Exploring reading and writing XLSX content with the XCO library` ).
    out->write( |\n\n| ).
    out->write( `-------------------- Read access to XLSX content --------------------` ).
    out->write( |\n\n| ).

    "Note: Using method chaining, the following method calls can also be done in a more concise way.

    "As a first step (for reading and writing XLSX content), getting a handle to process
    "XLSX content, which is available as xstring.
    DATA(xlsx_doc) = xco_cp_xlsx=>document->for_file_content( xlsx-file_content ).

    "------------------------ Read access to XLSX content ------------------------

    "Getting read access
    DATA(read_xlsx) = xlsx_doc->read_access( ).

    "Reading the first worksheet of the XLSX file
    DATA(worksheet1) = read_xlsx->get_workbook( )->worksheet->at_position( 1 ).
    "You can also specify the name of the worksheet
    "DATA(worksheet1) = read_xlsx->get_workbook( )->worksheet->for_name( 'Sheet1' ).

    "Using selection patterns
    "The XCO XLSX module works with selection patterns that define how the content
    "in a worksheet is selected (i.e. whether everything or a restricted set is selected).
    "Check the documentation for further information.
    "The following selection pattern respects all values.
    DATA(pattern_all) = xco_cp_xlsx_selection=>pattern_builder->simple_from_to( )->get_pattern( ).

    "The following selection pattern restricts the content used. Here, column A is left
    "out (starting from column B), and the first two rows are skipped (starting from row
    "number 3).
    DATA(pattern_restrict) = xco_cp_xlsx_selection=>pattern_builder->simple_from_to(
      )->from_column( xco_cp_xlsx=>coordinate->for_alphabetic_value( 'B' )
      )->from_row( xco_cp_xlsx=>coordinate->for_numeric_value( 3 )
      )->get_pattern( ).

    "--- Reading using row streams ---
    "The examples reads into an internal table of a known structure.
    "Declaring an internal table based on a local structure (representing
    "the 'known structure')
    TYPES: BEGIN OF carr_line_type,
             carrid   TYPE c LENGTH 3,
             carrname TYPE c LENGTH 20,
             currcode TYPE string,
             url      TYPE c LENGTH 255,
           END OF carr_line_type,
           carr_tab_type TYPE TABLE OF carr_line_type WITH EMPTY KEY.
    DATA carr_tab TYPE carr_tab_type.

    "Note that the content is written to a reference to an internal table
    "with the write_to method.
    worksheet1->select( pattern_all
      )->row_stream(
      )->operation->write_to( REF #( carr_tab )
      )->execute( ).

    "Retrieving the table lines to compare the values with the next
    "example that uses a different selection pattern
    DATA(lines_tab1) = lines( carr_tab ).
    "Displaying the read result in the console
    out->write( |Lines in carr_tab: { lines_tab1 }| ).
    out->write( data = carr_tab name = `carr_tab` ).
    out->write( |\n\n| ).
    CLEAR carr_tab.

    "Compare the content/output of the previous internal table and
    "the following one. The CARRID field is not filled because of starting
    "the selection in the second column. The first two entries of the previous
    "internal table are not available in the other because of starting in
    "the third row.
    worksheet1->select( pattern_restrict
      )->row_stream(
      )->operation->write_to( REF #( carr_tab )
      )->execute( ).

    DATA(lines_tab2) = lines( carr_tab ).
    out->write( |Lines in carr_tab: { lines_tab2 }| ).
    out->write( data = carr_tab name = `carr_tab` ).
    out->write( |\n\n| ).

    "--- Reading via a cursor ---
    "I.e. you specify the cursor position which represents the coordinate
    "values of column and row. Once specified, you can access the content based
    "on the cursor position in various directions using the MOVE* methods.

    "The following internal table is created for output purposes and includes
    "various pieces of cursor position information.
    TYPES: BEGIN OF cursor_info,
             string_value                  TYPE string,
             cursor_position_column_alphab TYPE string,
             cursor_position_column_num    TYPE i,
             cursor_position_row_alphab    TYPE string,
             cursor_position_row_num       TYPE i,
           END OF cursor_info.
    DATA itab_cursor_info_move_down TYPE TABLE OF cursor_info WITH EMPTY KEY.
    DATA itab_cursor_info_move_right TYPE TABLE OF cursor_info WITH EMPTY KEY.
    DATA itab_cursor_info_move_left TYPE TABLE OF cursor_info WITH EMPTY KEY.
    DATA itab_cursor_info_move_up TYPE TABLE OF cursor_info WITH EMPTY KEY.
    DATA string_value TYPE string.

    "Positioning the cursor (starting in column B, third row)
    DATA(cursor) = worksheet1->cursor(
      io_column = xco_cp_xlsx=>coordinate->for_alphabetic_value( 'B' )
      io_row    = xco_cp_xlsx=>coordinate->for_numeric_value( 3 )
       ).

    "Retrieving column and row information and storing it in a structure for
    "output purposes (to show where the cursor is positioned as specifed above)
    DATA(cursor_set) = VALUE cursor_info(
        cursor_position_column_alphab = cursor->position->column->get_alphabetic_value( )
        cursor_position_column_num = cursor->position->column->get_numeric_value( )
        cursor_position_row_alphab = cursor->position->row->get_alphabetic_value( )
        cursor_position_row_num = cursor->position->row->get_numeric_value( )
     ).

    "Getting the value
    "Note: String value transformation is done in the example. Note the information
    "in the documentation.
    cursor->get_cell( )->get_value(
        )->set_transformation( xco_cp_xlsx_read_access=>value_transformation->string_value
        )->write_to( REF #( string_value ) ).
    cursor_set-string_value = string_value.

    out->write( |Cursor information| ).
    out->write( |\n\n| ).
    out->write( data = cursor_set name = `cursor_set` ).
    out->write( |\n\n| ).

    "Looping across the cells and retrieving individual cursor position information and
    "the string values
    "--- Moving down ---
    WHILE cursor->has_cell( ) = abap_true AND cursor->get_cell( )->has_value( ) = abap_true.
      DATA(cell_cnt) = cursor->get_cell( ).
      "Storing column and row information in data objects
      DATA(cursor_position_column_alphab) = cursor->position->column->get_alphabetic_value( ).
      DATA(cursor_position_column_num) = cursor->position->column->get_numeric_value( ).
      DATA(cursor_position_row_alphab) = cursor->position->row->get_alphabetic_value( ).
      DATA(cursor_position_row_num) = cursor->position->row->get_numeric_value( ).

      "Getting the content of the cell by applying a value transformation to the
      "content
      cell_cnt->get_value(
        )->set_transformation( xco_cp_xlsx_read_access=>value_transformation->string_value
        )->write_to( REF #( string_value ) ).

      "Adding the column and row information and the string value to an internal table
      "for output purposes
      APPEND VALUE #(
        string_value = string_value cursor_position_column_alphab = cursor_position_column_alphab
        cursor_position_column_num = cursor_position_column_num
        cursor_position_row_alphab = cursor_position_row_alphab
        cursor_position_row_num = cursor_position_row_num ) TO itab_cursor_info_move_down.

      "Moving the cursor down
      TRY.
          cursor->move_down( ).
        CATCH cx_xco_runtime_exception.
          EXIT.
      ENDTRY.
    ENDWHILE.

    out->write( data = itab_cursor_info_move_down name = `itab_cursor_info_move_down` ).
    out->write( |\n\n| ).

    "--- Moving right ---
    "Repositioning the cursor
    cursor = worksheet1->cursor(
     io_column = xco_cp_xlsx=>coordinate->for_alphabetic_value( 'B' )
     io_row    = xco_cp_xlsx=>coordinate->for_numeric_value( 3 ) ).

    WHILE cursor->has_cell( ) = abap_true AND cursor->get_cell( )->has_value( ) = abap_true.
      cell_cnt = cursor->get_cell( ).
      cursor_position_column_alphab = cursor->position->column->get_alphabetic_value( ).
      cursor_position_column_num = cursor->position->column->get_numeric_value( ).
      cursor_position_row_alphab = cursor->position->row->get_alphabetic_value( ).
      cursor_position_row_num = cursor->position->row->get_numeric_value( ).
      cell_cnt->get_value(
        )->set_transformation( xco_cp_xlsx_read_access=>value_transformation->string_value
        )->write_to( REF #( string_value ) ).
      APPEND VALUE #( string_value = string_value cursor_position_column_alphab = cursor_position_column_alphab
      cursor_position_column_num = cursor_position_column_num
      cursor_position_row_alphab = cursor_position_row_alphab
      cursor_position_row_num = cursor_position_row_num ) TO itab_cursor_info_move_right.
      "Moving the cursor right
      TRY.
          cursor->move_right( ).
        CATCH cx_xco_runtime_exception.
          EXIT.
      ENDTRY.
    ENDWHILE.

    out->write( data = itab_cursor_info_move_right name = `itab_cursor_info_move_right` ).
    out->write( |\n\n| ).

    "--- Moving left ---
    "Repositioning the cursor
    cursor = worksheet1->cursor(
     io_column = xco_cp_xlsx=>coordinate->for_alphabetic_value( 'B' )
     io_row    = xco_cp_xlsx=>coordinate->for_numeric_value( 3 ) ).

    WHILE cursor->has_cell( ) = abap_true AND cursor->get_cell( )->has_value( ) = abap_true.
      cell_cnt = cursor->get_cell( ).
      cursor_position_column_alphab = cursor->position->column->get_alphabetic_value( ).
      cursor_position_column_num = cursor->position->column->get_numeric_value( ).
      cursor_position_row_alphab = cursor->position->row->get_alphabetic_value( ).
      cursor_position_row_num = cursor->position->row->get_numeric_value( ).
      cell_cnt->get_value(
        )->set_transformation( xco_cp_xlsx_read_access=>value_transformation->string_value
        )->write_to( REF #( string_value ) ).
      APPEND VALUE #( string_value = string_value cursor_position_column_alphab = cursor_position_column_alphab
      cursor_position_column_num = cursor_position_column_num
      cursor_position_row_alphab = cursor_position_row_alphab
      cursor_position_row_num = cursor_position_row_num ) TO itab_cursor_info_move_left.
      "Moving the cursor left
      TRY.
          cursor->move_left( ).
        CATCH cx_xco_runtime_exception.
          EXIT.
      ENDTRY.
    ENDWHILE.

    out->write( data = itab_cursor_info_move_left name = `itab_cursor_info_move_left` ).
    out->write( |\n\n| ).

    "--- Moving up ---
    "Repositioning the cursor
    cursor = worksheet1->cursor(
     io_column = xco_cp_xlsx=>coordinate->for_alphabetic_value( 'B' )
     io_row    = xco_cp_xlsx=>coordinate->for_numeric_value( 3 ) ).

    WHILE cursor->has_cell( ) = abap_true AND cursor->get_cell( )->has_value( ) = abap_true.
      cell_cnt = cursor->get_cell( ).
      cursor_position_column_alphab = cursor->position->column->get_alphabetic_value( ).
      cursor_position_column_num = cursor->position->column->get_numeric_value( ).
      cursor_position_row_alphab = cursor->position->row->get_alphabetic_value( ).
      cursor_position_row_num = cursor->position->row->get_numeric_value( ).
      cell_cnt->get_value(
        )->set_transformation( xco_cp_xlsx_read_access=>value_transformation->string_value
        )->write_to( REF #( string_value ) ).
      APPEND VALUE #( string_value = string_value cursor_position_column_alphab = cursor_position_column_alphab
      cursor_position_column_num = cursor_position_column_num
      cursor_position_row_alphab = cursor_position_row_alphab
      cursor_position_row_num = cursor_position_row_num ) TO itab_cursor_info_move_up.
      "Moving the cursor up
      TRY.
          cursor->move_up( ).
        CATCH cx_xco_runtime_exception.
          EXIT.
      ENDTRY.
    ENDWHILE.

    out->write( data = itab_cursor_info_move_up name = `itab_cursor_info_move_up` ).
    out->write( |\n\n| ).

**********************************************************************

    "------------------------ Write access to XLSX content ------------------------
    "- The following example creates a new XLSX document.
    "- Two worksheets are created.
    "- New content is added (based on demo internal tables).
    "- The existing XLSX content is replaced by the new content. An ABAP SQL UPDATE
    "  statement is included to update the file content. If you have implemented
    "  the SAP Fiori Elements and access the entry, you can download the new
    "  XLSX file to your local machine.
    "---------------------------------- NOTE ----------------------------------
    "---- Do note that this is just for demonstration purposes to quickly  ----
    "---- explore the new XLSX content (without considering RAP-related    ----
    "---  things and other database table fields such as the time stamps). ----

    out->write( `-------------------- Write XLSX content --------------------` ).
    out->write( |\n\n| ).

    "Creating a new XLSX document
    DATA(write_xlsx) = xco_cp_xlsx=>document->empty( )->write_access( ).
    "Note that the name of the created worksheet is Sheet1
    "Accessing the first worksheet via the position
    DATA(ws1) = write_xlsx->get_workbook( )->worksheet->at_position( 1 ).

    "Poviding XLSX content
    "--- Writing data via a row stream ---
    "In this case, the structure is statically known. The content of an internal table
    "is used.
    DATA(itab) = VALUE carr_tab_type(
      ( carrid = 'WX' carrname = 'Air WZ' currcode = 'GBP' url = 'some_url_wx' )
      ( carrid = 'XY' carrname = 'XY Airlines' currcode = 'EUR' url = 'some_url_xy' )
      ( carrid = 'YZ' carrname = 'YZ Airways' currcode = 'USD' url = 'some_url_yz' )
    ).

    "As is the case with the read access, a pattern is used.
    "The following pattern uses the entire content.
    DATA(pattern_all4write) = xco_cp_xlsx_selection=>pattern_builder->simple_from_to( )->get_pattern( ).

    "Writing the internal table lines to the worksheet using the write_from method
    ws1->select( pattern_all4write
      )->row_stream(
      )->operation->write_from( REF #( itab )
      )->execute( ).

    "--- Writing data via a cursor ---
    "To demonstrate this writing method, a new worksheet is created using the
    "add_new_sheet method. A name is provided, too.
    DATA(create_new_worksheet) = write_xlsx->get_workbook( )->add_new_sheet( `Sheet2` ).

    "Accessing the second worksheet via the position
    DATA(ws2) = write_xlsx->get_workbook( )->worksheet->at_position( 2 ).

    "Checking if the new worksheet exists at position 2 using the exists method
    DATA(ws2_pos_exists) = write_xlsx->get_workbook( )->worksheet->at_position( 2 )->exists( ).
    IF ws2_pos_exists = abap_true.
      out->write( `The newly created worksheet exists at position 2` ).
    ELSE.
      out->write( `The newly created worksheet does not exist at position 2` ).
    ENDIF.
    out->write( |\n\n| ).

    "Another internal table to have different demo data in the two worksheets
    DATA(itab2) = VALUE carr_tab_type(
      ( carrid = 'ZA' carrname = 'Air ZA' currcode = 'CAD' url = 'some_url_za' )
      ( carrid = 'YB' carrname = 'YB Airlines' currcode = 'JPY' url = 'some_url_yb' )
      ( carrid = 'XC' carrname = 'XC Airways' currcode = 'ZAR' url = 'some_url_xc' )
    ).

    "Example implementation: Looping across the internal table to put individual
    "component values in the worksheet
    LOOP AT itab2 INTO DATA(wa).
      DATA(tabix) = sy-tabix.
      "Positioning the cursor
      "The idea is to write all the content starting in the top left
      "corner of the worksheet. You can imagine other positions when
      "specifying actual parameters for io_column and io_row.
      "More methods are available. See the documentation.
      "Note: The cursor is repositioned with every loop pass here starting
      "with the first column. The row value is represented by the table
      "index (sy-tabix value), i.e. the second data set of the internal table
      "available in the work area in the second loop pass table goes in the
      "second row, and so on.
      DATA(cursor4write) = ws2->cursor(
        io_column = xco_cp_xlsx=>coordinate->for_alphabetic_value( 'A' )
        io_row    = xco_cp_xlsx=>coordinate->for_numeric_value( tabix ) ).

      cursor4write->get_cell( )->value->write_from( wa-carrid ).
      "Moving right to populate other columns
      cursor4write->move_right( )->get_cell( )->value->write_from( wa-carrname ).
      cursor4write->move_right( )->get_cell( )->value->write_from( wa-url ).
      "Note: The example skips one component.
    ENDLOOP.

    "Once content has been provided, getting the file content (both worksheets of
    "the example)
    DATA(file_content) = write_xlsx->get_file_content( ).

    "In this example, the uploaded XLSX content is replaced by the newly created
    "XLSX content by just updating the file_content field. It is just for demonstration
    "purposes as commented above. 
    "If you have created the SAP Fiori Elements preview app, you can download the XLSX file.
    "To do so, access the app via the service binding as described. Find the entry with the
    "provided ID (it is output in the console), and choose it. In the detail view of the app,
    "you can choose the button next to the file content. It should download an XLSX file,
    "now having the created content.
    UPDATE ztdemo_abap_xlsx SET file_content = @file_content WHERE id = @xlsx-id.

    IF sy-subrc = 0.
      out->write( |The database table was updated. If implemented, check the file with id { xlsx-id }| ).
    ELSE.
      out->write( `The database table was not updated.` ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.
```

</details>  

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>
