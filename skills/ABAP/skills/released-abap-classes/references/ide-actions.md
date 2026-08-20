# IDE actions

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- Creating and Using IDE Actions

---

## Creating and Using IDE Actions


- Miscellaneous interfaces such as `IF_AIA_ACTION` and classes (which are not detailed out here, and some of which are used by the demo examples) are usable in the context of IDE actions.
- IDE actions let you create simple features to extend ABAP development tools for Eclipse (ADT).
- With IDE actions, you can build custom functionalities using ABAP, especially for AI-related use cases.

> [!NOTE]  
> - Find more information on IDE actions and examples: 
>   - [in the SAP documentation](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/working-with-ide-actions). 
>   - [in this Devtoberfest session](https://youtu.be/YOIsyR5C2Mk?t=2304).
> - Your user must be assigned to the `SAP_A4C_BC_DEV_AIA_PC` business catalog. 

> [!IMPORTANT]   
> - The examples are simplified and only intended for [exploration, experimentation, and demonstration](./README.md#%EF%B8%8F-disclaimer), to get a high-level idea. They do not represent best practices or role model approaches for IDE action implementation.
> - The examples use `CL_DEMO_OUTPUT_CLOUD` to retrieve HTML output of data objects. Note that this class is intended for demo purposes only. The examples use the class's HTML capabilities for display. When you execute the example IDE actions, they present data objects in HTML within the IDE action result dialog. You may recognize this HTML presentation from the `CL_DEMO_OUTPUT` class that is available in Standard ABAP and used for demo display purposes, especially useful for displaying internal table content.
> - The use of IDE actions is your responsibility. Development and use are up to you. Refer to [this repository's disclaimer](./README.md#%EF%B8%8F-disclaimer) and the [disclaimer in the IDE action documentation](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/working-with-ide-actions). 
> - Be particularly mindful of the potential security risks when importing external content, which the simplified example code below does not address. The example code also uses dynamic programming techniques. They can pose a security risk. Refer to the [Dynamic Programming cheat sheet](06_Dynamic_Programming.md) and the ABAP Keyword Documentation.


The (non-AI-related) experiments include these IDE actions for demo purposes: 

<table>

<tr>
<th> IDE Action </th> <th> Notes </th>
</tr>

<tr>
<td> 

**File uploader and downloader** 

 </td>

 <td> 

- The demo IDE action allows for uploading and downloading files.
- The example includes the upload and processing of JSON and XLSX file content, as well as options to download and display XML, JSON, TXT, and HTML content.
- Find more notes in the code examples.

 </td>
</tr>

<tr>
<td> 

**Class runner and data object displayer** 

 </td>

 <td> 

- Similar to implementing the `IF_OO_ADT_CLASSRUN` interface (or its alternatives for demo display purposes), the demo IDE action lets you select and run a class that implements a specific demo interface.
- The IDE action result dialog uses HTML to display the content of data objects, like elementary data objects, structures, internal tables, and references, with the help of `CL_DEMO_OUTPUT_CLOUD`, instead of plain text in the ADT console.

 </td>
</tr>

<tr>
<td> 

**Method runner and parameter displayer**

 </td>

 <td> 

- The demo IDE action lets you select a usable and instantiable class. Once selected, you can choose a public instance or static method of that class to be called.
- After choosing a method, the IDE action dialog presents its input parameters (if any), allowing you to provide actual parameters for the formal parameters. Note that the example is simplified, only allowing character-like input. For example, a calculator method may require three inputs: two numbers and an operator. The example focuses on basic cases and does not perform input validation at runtime.
- When you run the IDE action, the method is executed. For instance methods, an instance of the class is created.
- As a result, the parameter table (refer to the Dynamic Programming cheat sheet) is displayed as HTML in the IDE action result dialog using `CL_DEMO_OUTPUT_CLOUD`, including any the input and output parameters and their values (if any).

 </td>
</tr>

<tr>
<td> 

**XLSX file importer and content displayer**

 </td>

 <td> 

- The demo IDE action lets you select an XLSX file from your local machine, retrieve its content, and display it in an internal table as HTML using `CL_DEMO_OUTPUT_CLOUD` in the IDE action result dialog.  
- In the selection IDE action dialog, you can specify which worksheet contains the content to retrieve. You can also choose where to start retrieving the content (e.g., from column A, row 1) and indicate if there is a header line. If a header exists, the content of that cells in that line are used as field names for the internal table.  
- When you run the IDE action, the XCO API is used to read the XLSX content. An internal table is created dynamically, and the worksheet content is added to it. Finally, this internal table is displayed as HTML in the IDE action result dialog.  

 </td>
</tr>

</table>


The class setup is similar across all examples:  
- Creation of repository objects for demo IDE actions.
- Each demo IDE action involves two global classes:
  - Implementing class
  - Input UI configuration class (some of which include implementation in the CCIMP include/Local types tab in ADT)
- A demo class to demonstrate the IDE action (except for the *XLSX file importer and content displayer* example; the examples use a demo class named `ZCL_DEMO_ABAP`)
- Some IDE action classes contain code within the CCIMP include.
- Some examples require the creation of a demo interface.

Expand the following collapsible sections for descriptions and example code:

<details>
  <summary>🟢 1) File uploader and downloader </summary>
  <!-- -->
<br>

**Demo Purpose** 

This demo IDE action lets you upload and process files, as well as download them. It showcases the upload and processing of JSON and XLSX files, along with download and display options for XML, JSON, TXT, and HTML content.

**Setup Steps**

1. Create IDE action
   - Access your demo package in ADT in your SAP BTP ABAP Environment.
   - Create a new repository object e.g. by right-clicking the package and choosing *New -> Other ABAP Repository Object -> Filter for IDE Action*.
   - Action creation: 
     - Name: *ZDEMO_ABAP_FILE_IMPORT_EXPORT*
     - Description: *File importer and exporter*
   - Make the following entries on the IDE action screen: 
     - Title: *Demo IDE Action: Import/Export*
     - Summary: *Action to upload and download files* 
     - Implementing Class: `ZCL_DEMO_ABAP_IDE_IMP_EXP_IMPL`
     - Input UI Configuration Class: `ZCL_DEMO_ABAP_IDE_IMP_EXP_UI`
     - Number of Focused Resources: *Any*
     - Filter Object Types: `CLAS` (choose *Add* and filter for `CLAS`)
2. Create the IDE action classes (implementing and input UI configuration class)
   - Choose the *Implementing Class* link. A pop-up is displayed to start the class creation. Provide a description and walk through the wizard. Once the class has been created, activate the class having no implementation at this stage. 
   - Go back and repeat the steps for the *Input UI Configuration Class*.
   - Once the classes have been created, activate the IDE action. The screen will show warnings regarding interfaces not implemented in the classes. 
   - For demo purposes, you can copy and paste the code from below. Note that the `ZCL_DEMO_ABAP_IDE_IMP_EXP_UI` class also requires code in the CCIMP include/Local Types tab in ADT.   
3. Create interface
     - Create an interface named `ZIF_DEMO_ABAP_IDE_IMP_EXP` and use the code below. Implementing `ZIF_DEMO_ABAP_IDE_IMP_EXP` is essential for checking out the IDE action. 
     - This interface defines the methods `process_import` and `export`, which include custom logic to process content for upload and download. For example, the example demonstrates uploading an XLSX file. The `process_import` method implementation in the `ZCL_DEMO_ABAP` class is specifically tailored for this example, allowing XLSX content to be uploaded and processed using the XLSX XCO API. The `export` method is designed to provide content for download based on the selected operation in the IDE action dialog. 
4. Create a class that implements the demo logic for uploading, downloading, and processing file content
    - Create a class named `ZCL_DEMO_ABAP` and use the code provided below. 
    - Note: The examples use a demo database table from the ABAP cheat sheet repository. If you have not imported the repository, create the `ZDEMO_ABAP_CARR` database table by reusing the code from the repository (see below). You can run this class using F9 in ADT to initialize the demo database table and add entries for testing. Refer to the comments in the class code, as you need to comment out a section of the code beforehand.
      ```abap
      @EndUserText.label : 'Demo table: Airline'
      @AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
      @AbapCatalog.tableCategory : #TRANSPARENT
      @AbapCatalog.deliveryClass : #A
      @AbapCatalog.dataMaintenance : #RESTRICTED
      define table zdemo_abap_carr {

          key mandt  : abap.clnt not null;
          key carrid : abap.char(3) not null;
          carrname   : abap.char(20) not null;
          currcode   : abap.cuky not null;
          url        : abap.char(255) not null;

      }
      ```

5. Perform a mass activation to activate all artifacts.
6. The demo includes uploading JSON and XLSX files. Ensure you have the necessary files and content to execute the demo according to the implementations in the `zif_demo_abap_ide_imp_exp~process_import` method of the `ZCL_DEMO_ABAP` class:      
   - Create a JSON file on your local machine, e.g. `carriers.json`, and insert the following content: 
      ```json
      [
        {
          "MANDT": "000",
          "CARRID": "ZZ",
          "CARRNAME": "ZZ Airlines",
          "CURRCODE": "USD",
          "URL": "some_url_zz_airlines"
        },
        {
          "MANDT": "000",
          "CARRID": "YY",
          "CARRNAME": "YY Airways",
          "CURRCODE": "EUR",
          "URL": "some_url_yy_airways"
        },
        {
          "MANDT": "000",
          "CARRID": "XX",
          "CARRNAME": "Air XX",
          "CURRCODE": "JPY",
          "URL": "some_url_air_xx"
        }
      ]
      ```
   - Create an XLSX file on your local machine, e.g. `carriers.xlsx`, and insert the following content: 

      <table border="1">
        <tr>
          <td>100</td>
          <td>AB</td>
          <td>AB Airlines</td>
          <td>EUR</td>
          <td>some_url_ab_airlines</td>
        </tr>
        <tr>
          <td>100</td>
          <td>CD</td>
          <td>CD Airways</td>
          <td>USD</td>
          <td>some_url_cd_airways</td>
        </tr>
        <tr>
          <td>100</td>
          <td>EF</td>
          <td>Air EF</td>
          <td>JPY</td>
          <td>some_url_air_ef</td>
        </tr>
      </table>

<br>

**Demo Execution Steps**

- In ADT, you have opened any class.
- Choose *STR + ALT/CMD + R* to run an IDE action.
- Select the IDE action *Demo IDE Action: Import/Export*. You can filter for *Export*.
- Choose *Run* (or double-click the IDE action).
- An IDE action dialog is displayed prompting you to provide a class. Insert the demo class `ZCL_DEMO_ABAP` (or browse). The demo expects a class to be specified that implements the `ZIF_DEMO_ABAP_IDE_IMP_EXP` interface.
- Checking out the demo **upload** functionality: 
  - Select *Upload* from the *Operation* dropdown list.
  - In the *File Import from Path* input field, select a file from your local machine. You can browse for it.
  - **Example 1** (JSON content upload): 
    - It is assumed that you have created a JSON file (e.g., `carriers.json`) as described above. 
    - Ensure you comment in the code for processing the JSON content in the `zif_demo_abap_ide_imp_exp~process_import` method of the `ZCL_DEMO_ABAP` class. Also, comment out the code for XLSX content processing.
    - Choose *Run*. The demo implementation includes deserializing the imported JSON content. The processing is demonstrated by adding the contained datasets to the demo database table. An IDE action popup will display a message based on the `message` parameter.
  - **Example 2** (XLSX content upload): 
    - Similar to example 1, it is assumed that you have created an XLSX file (e.g., `carriers.xlsx`) as described above. 
    - Ensure you comment in the code for processing the XLSX content in the `zif_demo_abap_ide_imp_exp~process_import` method of the `ZCL_DEMO_ABAP` class. Also, comment out the code for JSON content processing.
    - Choose *Run*. The demo implementation processes the XLSX content using the XLSX XCO API. Similar to the JSON example, a demo database table is updated based on the XLSX file content, and an IDE action popup will display a message.
- Checking out the demo **display and download** functionality: 
  - The demo includes the display and download of XML, JSON, TXT and HTML content. The *Operation* dropdown list includes the respective selection options.
  - When you select a specific download option, the `zif_demo_abap_ide_imp_exp~export` method of the `ZCL_DEMO_ABAP` class is called. Depending on the selection, demo code is executed. This is realized by an enumerated type, defined in the interface. An importing parameter is typed with this enumerated type. Its value determines what code is executed, realized by a `CASE` statement.
    - **XML** (asXML): Database table entries are retrieved using a `SELECT` statement. Using a `CALL TRANSFORMATION` statement, the internal table content is transformed (to asXML) and returned.
    - **JSON**: Database table entries are retrieved using a `SELECT` statement. Using the `/UI2/CL_JSON` class, the internal table content is converted to JSON and returned.
    - **TXT**: A simple string, representing the content of a TXT file, is returned.
    - **HTML**: Database table entries are retrieved using a `SELECT` statement. Using the `CL_DEMO_OUTPUT_CLOUD` class, the internal table content is converted to HTML and returned.
  - You can use the *Export...* button to download the appropriate files. The file extension is predefined; for example, XML downloads use `*.xml`. 
    - The IDE action is designed so that the *Run* functionality cannot be selected for download; it is only available for checking the upload functionality.
    - The HTML content is directly displayed in the IDE action dialog. You can download the file by right-clicking the displayed HTML and selecting the option to save it to your local machine.

<table>

<tr>
<th> Class (include)/Interface </th> <th> Code </th>
</tr>

<tr>
<td> 

`ZCL_DEMO_ABAP_IDE_IMP_EXP_IMPL` (global class; no code in other includes)

 </td>

 <td> 


``` abap
CLASS zcl_demo_abap_ide_imp_exp_impl DEFINITION
 PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_aia_action.

    CLASS-METHODS check_provided_class
      IMPORTING cl_name TYPE string
      EXPORTING result  TYPE string
                is_ok   TYPE abap_boolean.

  PROTECTED SECTION.
  PRIVATE SECTION.
    METHODS create_popup
      IMPORTING input         TYPE string
      RETURNING VALUE(result) TYPE REF TO if_aia_action_result.
ENDCLASS.



CLASS zcl_demo_abap_ide_imp_exp_impl IMPLEMENTATION.
  METHOD if_aia_action~run.
    TRY.
        DATA ui_input TYPE zcl_demo_abap_ide_imp_exp_ui=>ty_input.
        context->get_input_config_content( )->get_as_structure( IMPORTING result = ui_input ).
      CATCH cx_sd_invalid_data INTO DATA(exception).
        CLEAR ui_input.
        result = create_popup( `Initial input data. Check the implementation.` ).
        RETURN.
    ENDTRY.

    "Note: The following code is for the import scenario only.

    "Checking the provided class
    DATA(cl) = to_upper( condense( val = ui_input-class_impl_intf to = `` ) ).

    zcl_demo_abap_ide_imp_exp_impl=>check_provided_class( EXPORTING cl_name = cl
                                                          IMPORTING result  = DATA(cl_res)
                                                                    is_ok   = DATA(ok) ).

    IF ok = abap_true.
      DATA xstr TYPE xstring.
      DATA str TYPE string.
      DATA msg TYPE string.

      TRY.
          DATA(decoded_content) = cl_web_http_utility=>decode_x_base64( ui_input-path_text_field ).

          CALL METHOD (cl)=>zif_demo_abap_ide_imp_exp~process_import
            EXPORTING imported_content = decoded_content
                      str              = ui_input-path_text_field
            IMPORTING content_xstring  = xstr
                      content_string   = str
                      message          = msg.

          "Here; only a message is output.
          result = create_popup( msg ).
        CATCH cx_root into data(err).
          result = create_popup( `ERROR: Method call error with zif_demo_abap_ide_imp_exp~process_import. ` && err->get_text( ) ).
      ENDTRY.
    ELSE.
      result = create_popup( `ERROR: The provided class is not suitable for the IDE Action demo.` ).
    ENDIF.
  ENDMETHOD.

  METHOD check_provided_class.

    cl_abap_typedescr=>describe_by_name( EXPORTING p_name = cl_name
                                         RECEIVING p_descr_ref = DATA(tdo_type)
                                         EXCEPTIONS type_not_found = 4 ).

    IF sy-subrc <> 0.
      result = |Class { cl_name } does not exist.|.
    ELSE.
      TRY.
          DATA(tdo_cl) = CAST cl_abap_classdescr( tdo_type ).
          DATA(interfaces_cl) = tdo_cl->interfaces.

          IF NOT line_exists( interfaces_cl[ name = 'ZIF_DEMO_ABAP_IDE_IMP_EXP' ] ).
            result = |Class { cl_name } does not implement interface ZIF_DEMO_ABAP_IDE_IMP_EXP.|.
          ELSE.
            is_ok = abap_true.
          ENDIF.
        CATCH cx_root INTO DATA(err).
          result = err->get_text( ).
      ENDTRY.
    ENDIF.

  ENDMETHOD.

  METHOD create_popup.
    DATA(popup_result) = cl_aia_result_factory=>create_html_popup_result( ).
    popup_result->set_content( input ).
    result = popup_result.
  ENDMETHOD.
ENDCLASS.
``` 

 </td>
</tr>

<tr>
<td> 

`ZCL_DEMO_ABAP_IDE_IMP_EXP_UI` (global class)

 </td>

 <td> 


``` abap
CLASS zcl_demo_abap_ide_imp_exp_ui DEFINITION
 PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_aia_sd_action_input.

    CONSTANTS:
      BEGIN OF co_combo_box_operation,
        "! <p class="shorttext">Upload</p>
        upload       TYPE string VALUE `UPLOAD`,
        "! <p class="shorttext">Download XML</p>
        downloadxml  TYPE string VALUE `DOWNLOADXML`,
        "! <p class="shorttext">Download JSON</p>
        downloadjson TYPE string VALUE `DOWNLOADJSON`,
        "! <p class="shorttext">Download TXT</p>
        downloadtxt  TYPE string VALUE `DOWNLOADTXT`,
        "! <p class="shorttext">Display HTML</p>
        displayhtml  TYPE string VALUE `DISPLAYHTML`,
      END OF co_combo_box_operation.

    TYPES:
      "! <p class="shorttext">Make entries for uploading or downloading content:</p>
      BEGIN OF ty_input,
        "! <p class="shorttext">Class Implementing the ZIF_DEMO_ABAP_IDE_IMP_EXP Interface</p>
        "! $required
        class_impl_intf        TYPE string,
        "! $values { @link zcl_demo_abap_ide_imp_exp_ui.data:co_combo_box_operation }
        "! $default { @link zcl_demo_abap_ide_imp_exp_ui.data:co_combo_box_operation.upload }
        "! <p class="shorttext">Operation</p>
        ty_combo_box_operation TYPE string,
        "! <p class="shorttext">Note</p>
        note                   TYPE string,
        "! <p class="shorttext">File Import from Path</p>
        "! $contentEncoding 'base64'
        "! $required
        path_text_field        TYPE string,
        "! <p class="shorttext">XML Download</p>
        "! $contentMediaType 'application/xml'
        "! $contentEncoding 'base64'
        xmldownload            TYPE xstring,
        "! <p class="shorttext">JSON Download</p>
        "! $contentMediaType 'application/json'
        "! $contentEncoding 'base64'
        jsondownload           TYPE xstring,
        "! <p class="shorttext">TXT Download</p>
        "! $contentMediaType 'text/plain'
        txtdownload            TYPE string,
        "! <p class="shorttext">HTML Display</p>
        "! $contentMediaType 'text/html'
        htmldisplay            TYPE string,
      END OF ty_input.

  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.



CLASS zcl_demo_abap_ide_imp_exp_ui IMPLEMENTATION.
  METHOD if_aia_sd_action_input~create_input_config.
    TRY.
        DATA(resource) = CAST if_adt_context_src_based_obj( context->get_focused_resource( ) ).
        DATA(focused_resources) = context->get_focused_resources( ).
        LOOP AT focused_resources ASSIGNING FIELD-SYMBOL(<focused_resource>).
          IF <focused_resource>->get_kind( ) = if_adt_context_resource=>kind-source_based_dev_object.
            DATA(source_based_object) = CAST if_adt_context_src_based_obj( <focused_resource> ).
            DATA(cl) = source_based_object->get_object_info( )-display_name.
            DATA(type) = <focused_resource>->get_type( ).
            IF type = `CLAS/OC`.
              EXIT.
            ENDIF.
          ENDIF.
        ENDLOOP.
      CATCH cx_root.
    ENDTRY.

    "Default values for input data
    DATA(input_data) = VALUE ty_input( ty_combo_box_operation = `upload`
                                       note = `Provide a class` ).

    DATA(configuration) = ui_information_factory->get_configuration_factory( )->create_for_data( input_data ).

    configuration->get_element( 'path_text_field' )->set_file_properties( kind          = if_sd_config_element=>file_properties_kind-path
                                                                          transfer_mode = VALUE #( import = abap_true ) ).

    configuration->get_element( 'xmldownload' )->set_file_properties( kind           = if_sd_config_element=>file_properties_kind-content
                                                                      transfer_mode  = VALUE #( export = abap_true )
                                              )->set_multiline( if_sd_config_element=>height-large
                                              )->set_read_only( abap_true ).

    configuration->get_element( 'jsondownload' )->set_file_properties( kind           = if_sd_config_element=>file_properties_kind-content
                                                                       transfer_mode  = VALUE #( export = abap_true )
                                               )->set_multiline( if_sd_config_element=>height-large
                                               )->set_read_only( abap_true ).

    configuration->get_element( 'txtdownload' )->set_file_properties( kind           = if_sd_config_element=>file_properties_kind-content
                                                                      transfer_mode  = VALUE #( export = abap_true )
                                              )->set_multiline( if_sd_config_element=>height-large
                                              )->set_read_only( abap_true ).

    configuration->get_element( 'htmldisplay' )->set_file_properties( kind           = if_sd_config_element=>file_properties_kind-content
                                                                      transfer_mode  = VALUE #( export = abap_true )
                                              )->set_multiline( if_sd_config_element=>height-large
                                              )->set_read_only( abap_true ).

    configuration->get_element( 'note' )->set_read_only( abap_true ).

    configuration->get_element( 'class_impl_intf' )->set_types( VALUE #( ( `CLAS/OC` ) ) ).

    "Setting side effects
    configuration->get_element( 'class_impl_intf' )->set_sideeffect( after_update    = abap_true
                                                                     feature_control = abap_true ).

    configuration->get_element( 'ty_combo_box_operation' )->set_sideeffect( after_update = abap_true  ).

    configuration->get_element( 'path_text_field' )->set_sideeffect( after_update    = abap_true
                                                                     feature_control = abap_true ).

    configuration->get_element( 'note' )->set_sideeffect( feature_control = abap_true ).

    result = ui_information_factory->for_abap_type( abap_type     = input_data
                                                    configuration = configuration ).

  ENDMETHOD.

  METHOD if_aia_sd_action_input~get_value_help_provider.
    "Getting a reference to the value help handler via the value help provider
    "The example uses a local class as value help provider. The method implementation
    "there is intentionally empty. The value help provider is required in the example
    "for the class selection popup to display.
    result = cl_sd_value_help_provider=>create( NEW lcl_demo_abap_action_impexp_vh( ) ).
  ENDMETHOD.

  METHOD if_aia_sd_action_input~get_side_effect_provider.
    "Getting a reference to the side effect handler via the side effect provider
    "The example uses a local class as side effect provider.
    result = cl_sd_sideeffect_provider=>create( feature_control = NEW lcl_demo_abap_action_impexp_se( )
                                                determination   = NEW lcl_demo_abap_action_impexp_se( ) ).
  ENDMETHOD.
ENDCLASS.
``` 

 </td>
</tr>

<tr>
<td> 

`ZCL_DEMO_ABAP_IDE_IMP_EXP_UI` (CCIMP include/Local Types tab in ADT)

 </td>

 <td> 


``` abap
*&---------------------------------------------------------------------*
*& Value help handler
*&---------------------------------------------------------------------*

CLASS lcl_demo_abap_action_impexp_vh DEFINITION.
  PUBLIC SECTION.
    INTERFACES if_sd_value_help_dsni.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.


CLASS lcl_demo_abap_action_impexp_vh IMPLEMENTATION.
  METHOD if_sd_value_help_dsni~get_value_help_items.
    "The method implementation is intentionally empty.
  ENDMETHOD.
ENDCLASS.


*&---------------------------------------------------------------------*
*& Side effect handler
*&---------------------------------------------------------------------*

CLASS lcl_demo_abap_action_impexp_se DEFINITION.
  PUBLIC SECTION.
    INTERFACES:
      if_sd_determination,
      if_sd_feature_control.
  PROTECTED SECTION.
  PRIVATE SECTION.
    CLASS-METHODS call_export_method
      IMPORTING operation  TYPE string
                class_name TYPE string
      CHANGING  input      TYPE zcl_demo_abap_ide_imp_exp_ui=>ty_input.
ENDCLASS.

CLASS lcl_demo_abap_action_impexp_se IMPLEMENTATION.

  METHOD if_sd_determination~run.
    IF context IS INSTANCE OF cl_aia_sd_context.
      FINAL(action_context) = CAST cl_aia_sd_context( context )->get_ide_action_context( ).
    ENDIF.

    "Retrieving the model
    DATA(input_data) = VALUE zcl_demo_abap_ide_imp_exp_ui=>ty_input( ).
    model->get_as_structure( IMPORTING result = input_data ).

    IF ( id = 'CLASS_IMPL_INTF' AND determination_kind = if_sd_determination=>kind-after_update )
    OR ( id = 'TY_COMBO_BOX_OPERATION' AND determination_kind = if_sd_determination=>kind-after_update ).
      TRY.
          DATA(cl) = to_upper( condense( val = input_data-class_impl_intf to = `` ) ).
          zcl_demo_abap_ide_imp_exp_impl=>check_provided_class( EXPORTING cl_name = cl
                                                                IMPORTING result  = DATA(res)
                                                                          is_ok = DATA(ok) ).

          IF ok = abap_false.
            IF input_data-class_impl_intf IS INITIAL.
              input_data-note = |NOTE: Insert a class in the input field.|.
            ELSE.
              input_data-note = |NOTE: Class { input_data-class_impl_intf } does not implement interface ZIF_DEMO_ABAP_IDE_IMP_EXP.|.
            ENDIF.
            CLEAR input_data-txtdownload.
            CLEAR input_data-jsondownload.
            CLEAR input_data-xmldownload.
            CLEAR input_data-htmldisplay.
          ELSE.
            IF input_data-ty_combo_box_operation = `upload`.
              input_data-note = |Upload option selected. Provide the file path and choose Run.|.
            ELSE.
              call_export_method( EXPORTING operation  = input_data-ty_combo_box_operation
                                            class_name = cl
                                  CHANGING  input      = input_data ).
            ENDIF.
          ENDIF.
        CATCH cx_root INTO DATA(e).
          input_data-note = |NOTE: { e->get_text( ) }|.
          CLEAR input_data-txtdownload.
          CLEAR input_data-jsondownload.
          CLEAR input_data-xmldownload.
          CLEAR input_data-htmldisplay.
      ENDTRY.
    ENDIF.

    "Returning the changed model
    result = input_data.
  ENDMETHOD.

  METHOD if_sd_feature_control~run.
    "Retrieving the model
    DATA(input_data) = VALUE zcl_demo_abap_ide_imp_exp_ui=>ty_input( ).
    model->get_as_structure( IMPORTING result = input_data ).

    "Creating the initial feature control
    DATA(feature_control) = feature_control_factory->create_for_data( input_data ).

    IF feature_control_kind = if_sd_feature_control=>kind-on_input.
      feature_control->get_element( 'XMLDOWNLOAD' )->set_hidden( abap_true ).
      feature_control->get_element( 'JSONDOWNLOAD' )->set_hidden( abap_true ).
      feature_control->get_element( 'TXTDOWNLOAD' )->set_hidden( abap_true ).
      feature_control->get_element( 'HTMLDISPLAY' )->set_hidden( abap_true ).
    ENDIF.

    IF feature_control_kind = if_sd_feature_control=>kind-on_update.
      CASE input_data-ty_combo_box_operation.
        WHEN `upload`.
          IF input_data-note CS `NOTE:`.
            feature_control->get_element( 'PATH_TEXT_FIELD' )->set_hidden( abap_true ).
            feature_control->get_element( 'XMLDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'JSONDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'TXTDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'HTMLDISPLAY' )->set_hidden( abap_true ).
          ELSE.
            feature_control->get_element( 'PATH_TEXT_FIELD' )->set_hidden( abap_false  ).
            feature_control->get_element( 'XMLDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'JSONDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'TXTDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'HTMLDISPLAY' )->set_hidden( abap_true ).
          ENDIF.
        WHEN `downloadxml`.
          IF input_data-note CS `NOTE:`.
            feature_control->get_element( 'PATH_TEXT_FIELD' )->set_hidden( abap_true ).
            feature_control->get_element( 'XMLDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'JSONDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'TXTDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'HTMLDISPLAY' )->set_hidden( abap_true ).
          ELSE.
            feature_control->get_element( 'PATH_TEXT_FIELD' )->set_hidden( abap_true  ).
            feature_control->get_element( 'XMLDOWNLOAD' )->set_hidden( abap_false ).
            feature_control->get_element( 'JSONDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'TXTDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'HTMLDISPLAY' )->set_hidden( abap_true ).
          ENDIF.
        WHEN `downloadjson`.
          IF input_data-note CS `NOTE:`.
            feature_control->get_element( 'PATH_TEXT_FIELD' )->set_hidden( abap_true ).
            feature_control->get_element( 'XMLDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'JSONDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'TXTDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'HTMLDISPLAY' )->set_hidden( abap_true ).
          ELSE.
            feature_control->get_element( 'PATH_TEXT_FIELD' )->set_hidden( abap_true  ).
            feature_control->get_element( 'XMLDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'JSONDOWNLOAD' )->set_hidden( abap_false ).
            feature_control->get_element( 'TXTDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'HTMLDISPLAY' )->set_hidden( abap_true ).
          ENDIF.
        WHEN `downloadtxt`.
          IF input_data-note CS `NOTE:`.
            feature_control->get_element( 'PATH_TEXT_FIELD' )->set_hidden( abap_true ).
            feature_control->get_element( 'XMLDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'JSONDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'TXTDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'HTMLDISPLAY' )->set_hidden( abap_true ).
          ELSE.
            feature_control->get_element( 'PATH_TEXT_FIELD' )->set_hidden( abap_true ).
            feature_control->get_element( 'XMLDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'JSONDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'TXTDOWNLOAD' )->set_hidden( abap_false ).
            feature_control->get_element( 'HTMLDISPLAY' )->set_hidden( abap_true ).
          ENDIF.
        WHEN `displayhtml`.
          IF input_data-note CS `NOTE:`.
            feature_control->get_element( 'PATH_TEXT_FIELD' )->set_hidden( abap_true ).
            feature_control->get_element( 'XMLDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'JSONDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'TXTDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'HTMLDISPLAY' )->set_hidden( abap_true ).
          ELSE.
            feature_control->get_element( 'PATH_TEXT_FIELD' )->set_hidden( abap_true  ).
            feature_control->get_element( 'XMLDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'JSONDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'TXTDOWNLOAD' )->set_hidden( abap_true ).
            feature_control->get_element( 'HTMLDISPLAY' )->set_hidden( abap_false ).
          ENDIF.
      ENDCASE.
    ENDIF.

    "Returning the feature control
    result = feature_control.
  ENDMETHOD.

  METHOD call_export_method.

    DATA xstr TYPE xstring.
    DATA msg TYPE string.
    DATA str TYPE string.

    TRY.
        CALL METHOD (class_name)=>zif_demo_abap_ide_imp_exp~export
          EXPORTING
            proc_kind      = SWITCH zif_demo_abap_ide_imp_exp=>proc_kind( input-ty_combo_box_operation
                                                                          WHEN `downloadxml` THEN zif_demo_abap_ide_imp_exp=>xml
                                                                          WHEN `downloadjson` THEN zif_demo_abap_ide_imp_exp=>json
                                                                          WHEN `downloadtxt` THEN zif_demo_abap_ide_imp_exp=>txt
                                                                          WHEN `displayhtml` THEN zif_demo_abap_ide_imp_exp=>html )
          IMPORTING
            content        = xstr
            content_string = str
            message        = msg.
      CATCH cx_root INTO DATA(err).
        input-note = |ERROR: Method call error with zif_demo_abap_ide_imp_exp~export. { err->get_text( ) }|.
        RETURN.
    ENDTRY.

    IF xstr IS INITIAL AND str IS INITIAL.
      input-note = |Initial result when calling the EXPORT method.|.
      CLEAR input-txtdownload.
      CLEAR input-jsondownload.
      CLEAR input-xmldownload.
      CLEAR input-htmldisplay.
    ELSE.
      CASE input-ty_combo_box_operation.
        WHEN `downloadxml`.
          input-xmldownload = xstr.
        WHEN `downloadjson`.
          input-jsondownload = xstr.
        WHEN `downloadtxt`.
          input-txtdownload = str.
        WHEN `displayhtml`.
          input-htmldisplay = str.
      ENDCASE.
      input-note = |Download/Display option selected. No 'Run' functionality.|.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
``` 

 </td>
</tr>

<tr>
<td> 

Interface to check out the IDE action<br><br>
`ZIF_DEMO_ABAP_IDE_IMP_EXP` 

 </td>

 <td> 


``` abap
INTERFACE zif_demo_abap_ide_imp_exp
  PUBLIC .

  TYPES: BEGIN OF ENUM proc_kind,
           xml,
           json,
           txt,
           html,
         END OF ENUM proc_kind.

  CLASS-METHODS: process_import IMPORTING imported_content TYPE xstring OPTIONAL
                                          str              TYPE string OPTIONAL
                                EXPORTING content_xstring  TYPE xstring
                                          content_string   TYPE string
                                          message          TYPE string,

    export IMPORTING proc_kind      TYPE zif_demo_abap_ide_imp_exp=>proc_kind
           EXPORTING content        TYPE xstring
                     content_string TYPE string
                     message        TYPE string.
ENDINTERFACE.
``` 

 </td>
</tr>

<tr>
<td> 

Class to check out the IDE action<br><br>
`ZCL_DEMO_ABAP` (global class) 

 </td>

 <td> 


``` abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES: zif_demo_abap_ide_imp_exp,
      if_oo_adt_classrun.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_demo_abap IMPLEMENTATION.

  METHOD zif_demo_abap_ide_imp_exp~export.

*&---------------------------------------------------------------------*
*& NOTE
*&
*& Here goes logic to prepare file download / HTML content display.
*& The method includes an enumerated type as importing parameter, based
*& on which demo implementations are executed.
*&
*& The examples use a demo database table of the ABAP cheat sheet
*& repository. If you have not imported the repository, you can create
*& the zdemo_abap_carr database table by reusing the code from the
*& repository. You can then run this class using F9 in ADT to initialize
*& the demo database table, and add some entries to have data to work with.
*&
*& This demo example covers these use cases:
*& - XML download (asXML created by transforming internal table content to
*&   XML)
*& - JSON download (JSON created by converting internal table content to
*&   JSON
*& - TXT download (the content of the file is represented by a simple
*&   string)
*& - HTML display/file download (using the cl_demo_output_cloud class -
*&   which is for demo purposes only - internal table content is
*&   converted to HTML; check the notes below)
*&
*&---------------------------------------------------------------------*

    CASE proc_kind.

*&---------------------------------------------------------------------*
*& XML file download (asXML)
*&---------------------------------------------------------------------*

      WHEN zif_demo_abap_ide_imp_exp=>xml.

        SELECT * FROM zdemo_abap_carr INTO TABLE @DATA(itab).
        CALL TRANSFORMATION id SOURCE itab = itab
                               RESULT XML content.

*&---------------------------------------------------------------------*
*& JSON file download
*&---------------------------------------------------------------------*

      WHEN  zif_demo_abap_ide_imp_exp=>json.

        SELECT * FROM zdemo_abap_carr INTO TABLE @DATA(it).
        DATA(abap_to_json) = /ui2/cl_json=>serialize( data = it ).
        content = cl_abap_conv_codepage=>create_out( codepage = `UTF-8` )->convert( abap_to_json ).

*&---------------------------------------------------------------------*
*& TXT file download
*&---------------------------------------------------------------------*

      WHEN zif_demo_abap_ide_imp_exp=>txt.

        content_string = `This is some text for a txt file.`.

*&---------------------------------------------------------------------*
*& HTML display/file download
*&---------------------------------------------------------------------*

        "Note:
        "- See the notes in the implementation of if_oo_adt_classrun~main regarding
        "  commenting in and out of the following code snippet.
        "- The IDE action will display the HTML content in a window. To download the
        "  HTML file, you can make a right-click in this window and save it locally..

      WHEN zif_demo_abap_ide_imp_exp=>html.

        SELECT * FROM zdemo_abap_carr INTO TABLE @DATA(it4html).
        DATA(output_oref) = cl_demo_output_cloud=>new( cl_demo_output_cloud=>html ).
        content_string = output_oref->get( it4html ).

    ENDCASE.

  ENDMETHOD.

  METHOD zif_demo_abap_ide_imp_exp~process_import.

*&---------------------------------------------------------------------------------*
*& NOTE
*&
*& Here goes logic to process imported content, which can be content
*& of type string or xstring, depending on how the input fields are typed.
*& The example only uses xstring. The example method's exporting parameters
*& are not used except for the 'message' parameter that is used for IDE
*& action output.
*&
*& This demo example covers these use cases (see the notes in the cheat sheet
*& document of the ABAP cheat sheets GitHub repository):
*&
*& 1) JSON import
*&    The assumption is that you have created the demo json file on your local
*&    machine as described. This file is uploaded and processed further in this
*&    method by deserializing the JSON content. The JSON content represents
*&    datasets that are added to a demo database table.
*&
*& 2) XLSX import
*&    As above, it is assumed that you have created a demo XLSX file as described.
*&    Using the XLSX XCO API, the XLSX content is further processed. Similar to the
*&    JSON import example, the XLSX content represents datasets to be added to
*&    the database table.
*&
*& Comment in/out the code for checking out the demo. Ensure that only one example
*& is commented in, and you use the appropriate demo content to be uploaded.
*&
*&---------------------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& 1) JSON import
*&---------------------------------------------------------------------*

    TRY.
        DATA(file_content) = cl_abap_conv_codepage=>create_in( )->convert( imported_content ).

        DATA tab TYPE TABLE OF zdemo_abap_carr WITH EMPTY KEY.
        /ui2/cl_json=>deserialize( EXPORTING json = file_content
                                   CHANGING data  = tab ).

        MODIFY zdemo_abap_carr FROM TABLE @tab.

        IF tab IS INITIAL.
          message = `Internal table is initial. No database table modification performed.`.
        ELSEIF sy-subrc = 0.
          message = `Database table modification successful.`.
        ELSE.
          message = `Issue with implemented database table modification.`.
        ENDIF.

      CATCH cx_root INTO DATA(err_json).
        message = err_json->get_text( ).
    ENDTRY.

*&---------------------------------------------------------------------*
*& 2) XLSX import
*&---------------------------------------------------------------------*

*    DATA itab TYPE TABLE OF zdemo_abap_carr WITH EMPTY KEY.
*
*    TRY.
*        DATA(xlsx_content) = cl_web_http_utility=>decode_x_base64( str ).
*        DATA(xlsx_doc) = xco_cp_xlsx=>document->for_file_content( xlsx_content ).
*                DATA(read_xlsx) = xlsx_doc->read_access( ).
*        DATA(worksheet) = read_xlsx->get_workbook( )->worksheet->at_position( 1 ).
*        DATA(pattern_all) = xco_cp_xlsx_selection=>pattern_builder->simple_from_to( )->get_pattern( ).
*        worksheet->select( pattern_all
*                )->row_stream(
*                )->operation->write_to( REF #( itab )
*                )->execute( ).
*
*        MODIFY zdemo_abap_carr FROM TABLE @itab.
*
*        IF itab IS INITIAL.
*          message = `Internal table is initial. No database table modification performed.`.
*        ELSEIF sy-subrc = 0.
*          message = `Database table modification successful.`.
*        ELSE.
*          message = `Issue with implemented database table modification.`.
*        ENDIF.
*
*      CATCH cx_root INTO DATA(err_xlsx).
*        message = err_xlsx->get_text( ).
*    ENDTRY.

  ENDMETHOD.

  METHOD if_oo_adt_classrun~main.

*&---------------------------------------------------------------------------------*
*& NOTE
*&
*& - Run this class to initialize the demo database table for the example.
*& - For the classrun to execute, comment out the code available in the
*&   'WHEN zif_demo_abap_ide_imp_exp=>html' branch since it uses the
*&   CL_DEMO_OUTPUT_CLOUD class. If the code is still in, the message
*&   'Do not use CL_DEMO_OUTPUT_CLOUD in classes implementing IF_OO_ADT_CLASSRUN.'
*&   is displayed in the ADT console. After the successful execution, the
*&   database table should be initialized, and you can comment in the code
*&   again.
*&---------------------------------------------------------------------------------*

    DELETE FROM zdemo_abap_carr.

    MODIFY zdemo_abap_carr FROM TABLE @( VALUE #(
           ( carrid = 'AA'
             carrname = 'American Airlines'
             currcode = 'USD'
             url =  'http://www.aa.com' )
           ( carrid = 'LH'
             carrname = 'Lufthansa'
             currcode = 'EUR'
             url =  'http://www.lufthansa.com' )
           ( carrid = 'JL'
             carrname = 'Japan Airlines'
             currcode = 'JPY'
             url =  'http://www.jal.co.jp' )
           ( carrid = 'DL'
             carrname = 'Delta Airlines'
             currcode = 'USD'
             url =  'http://www.delta-air.com' )
           ( carrid = 'AZ'
             carrname = 'ITA Airways'
             currcode = 'EUR'
             url =  'http://www.ita-airways.com' ) ) ).

    SELECT * FROM zdemo_abap_carr INTO TABLE @DATA(it).
    out->write( it ).

  ENDMETHOD.
ENDCLASS.
``` 

 </td>
</tr>

</table>

</details>  

<br>

<details>
  <summary>🟢 2) Class runner and data object displayer </summary>
  <!-- -->
<br>

**Demo Purpose** 

This demo IDE action runs classes and displays the content of data objects in an `IF_OO_ADT_CLASSRUN`-like style. Instead of plain text in the ADT console, it presents the results as HTML in an IDE action result dialog in ADT.

**Steps**

- Access your demo package in ADT in your SAP BTP ABAP Environment.
- Create a new repository object e.g. by right-clicking the package and choosing *New -> Other ABAP Repository Object -> Filter for IDE Action*.
- Action creation: 
  - Name: *ZDEMO_ABAP_IDE_ACTION_OUTPUT*
  - Description: *IDE Action for HTML Output*
- Make the following entries on the IDE action screen: 
  - Title: *Demo IDE Action: HTML Output*
  - Summary: *Action to display the content of data objects as HTML in an IDE action result dialog* 
  - Implementing Class: `ZCL_DEMO_ABAP_ACTION_OUTPUT`
  - Input UI Configuration Class: `ZCL_DEMO_ABAP_ACTION_OUTPUT_UI`
  - Number of Focused Resources: *Any*
  - Filter Object Types: `CLAS` (choose *Add* and filter for `CLAS`)
- Create the classes
  - Click the *Implementing Class* link. A pop-up is displayed to start the class creation. Provide a description and walk through the wizard. Once the class has been created, activate the class having no implementation at this stage. 
  - Go back and repeat the steps for the *Input UI Configuration Class*.
- Once the classes have been created, activate the IDE action. The screen will show warnings regarding interfaces not implemented in the classes. 
- For demo purposes, you can copy and paste the code from below. 
- Perform a mass activation to activate the classes because one class uses types specified in the other class. 
- To check out the action, proceed as follows: 
  - Create an interface named `ZIF_DEMO_ABAP_OUTPUT` and use the code from below. `ZIF_DEMO_ABAP_OUTPUT` is essential to be implemented for checking out the IDE action.     
  - Create a class named `ZCL_DEMO_ABAP` and use the code from below (contains a collection of various data objects that should be displayed). 
  - In ADT, you have opened the demo class `ZCL_DEMO_ABAP` (or any class implementing the interface).
  - Choose *STR + ALT/CMD + R* to run an IDE action.
  - Select the IDE action. You can filter for *HTML Output*.
  - Choose *Run*.
  - An IDE action dialog is displayed prompting you to provide a class. Insert the testing class `ZCL_DEMO_ABAP` (or browse, or you have run the action in a class filling the input field automatically).
  - Choose *Run*.
  - The IDE action result dialog is displayed showing the HTML output of the data objects that were written using `out->write( ... ).` and other methods that the `CL_DEMO_OUTPUT_CLOUD` class offers..
  - The example class is designed to demonstrate various data objects, ranging from elementary types to more complex types such as structures and internal tables, including nested structures, deep internal tables, and data references. 

<table>

<tr>
<th> Class (include)/Interface </th> <th> Code </th>
</tr>

<tr>
<td> 

`ZCL_DEMO_ABAP_ACTION_OUTPUT` (global class; no code in other includes)

 </td>

 <td> 


``` abap
CLASS zcl_demo_abap_action_output DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_aia_action.
  PROTECTED SECTION.
  PRIVATE SECTION.
    CLASS-METHODS get_output IMPORTING VALUE(class)  TYPE string
                             RETURNING VALUE(result) TYPE string.
ENDCLASS.



CLASS zcl_demo_abap_action_output IMPLEMENTATION.
  METHOD get_output.
    class = condense( val = to_upper( class ) to = `` ).

    "Checking if input is a class
    cl_abap_classdescr=>describe_by_name(
      EXPORTING
        p_name         = class
      RECEIVING
        p_descr_ref    = DATA(tdo)
      EXCEPTIONS
        type_not_found = 1
        OTHERS         = 2 ).

    IF sy-subrc <> 0.
      result = |Class { class } not found|.
      RETURN.
    ENDIF.

    "Checking whether class is instantiatable
    IF tdo->is_instantiatable( ) = abap_false.
      result = |Class { class } cannot be instantiated|.
      RETURN.
    ENDIF.

    "Checking whether the class implements the ZIF_DEMO_ABAP_OUTPUT interface
    READ TABLE CAST cl_abap_classdescr( tdo )->interfaces WITH KEY name = 'ZIF_DEMO_ABAP_OUTPUT' TRANSPORTING NO FIELDS.

    IF sy-subrc <> 0.
      result = |Class { class } does not implement the ZIF_DEMO_ABAP_OUTPUT interface|.
      RETURN.
    ENDIF.

    DATA oref TYPE REF TO object.
    TRY.
        DATA(output_oref) = cl_demo_output_cloud=>new( cl_demo_output_cloud=>html ).
        CREATE OBJECT oref TYPE (class).
        CALL METHOD oref->('ZIF_DEMO_ABAP_OUTPUT~MAIN') EXPORTING out = output_oref.
        result = output_oref->get( ).
      CATCH cx_root INTO DATA(error).
        result = error->get_text( ).
    ENDTRY.
  ENDMETHOD.


  METHOD if_aia_action~run.
    DATA popup_result TYPE REF TO if_aia_popup_result.
    popup_result = cl_aia_result_factory=>create_html_popup_result( ).

    TRY.
        DATA ui_input TYPE zcl_demo_abap_action_output_ui=>ty_input.
        context->get_input_config_content( )->get_as_structure( IMPORTING result = ui_input ).
      CATCH cx_sd_invalid_data INTO DATA(exception).
        CLEAR ui_input.
        popup_result->set_content( exception->get_text( ) ).
        result = popup_result.
        RETURN.
    ENDTRY.

    popup_result->set_content( get_output( ui_input-class_name ) ).
    result = popup_result.
  ENDMETHOD.
ENDCLASS.
``` 

 </td>
</tr>

<tr>
<td> 

`ZCL_DEMO_ABAP_ACTION_OUTPUT_UI` (global class)

 </td>

 <td> 


``` abap
CLASS zcl_demo_abap_action_output_ui DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_aia_sd_action_input.

    TYPES:
      "! <p class="shorttext">Provide a class that implements the interface zif_demo_abap_output</p>
      BEGIN OF ty_input,
        "! <p class="shorttext">Class</p>
        "! $required
        class_name TYPE string,
      END OF ty_input.

  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.



CLASS zcl_demo_abap_action_output_ui IMPLEMENTATION.


  METHOD if_aia_sd_action_input~create_input_config.

    TRY.
        DATA(resource) = CAST if_adt_context_src_based_obj( context->get_focused_resource( ) ).
        DATA(focused_resources) = context->get_focused_resources( ).
        LOOP AT focused_resources ASSIGNING FIELD-SYMBOL(<focused_resource>).
          IF <focused_resource>->get_kind( ) = if_adt_context_resource=>kind-source_based_dev_object.
            DATA(source_based_object) = CAST if_adt_context_src_based_obj( <focused_resource> ).
            DATA(cl) = source_based_object->get_object_info( )-display_name.
            DATA(type) = <focused_resource>->get_type( ).

            IF type = `CLAS/OC`.
              DATA(ok) = abap_true.
              EXIT.
            ENDIF.
          ENDIF.
        ENDLOOP.
      CATCH cx_root.
    ENDTRY.

    "Default values for input data
    DATA(input_data) = VALUE ty_input( class_name = cl ).

    "Creating the configuration
    DATA(configuration) = ui_information_factory->get_configuration_factory(
                                               )->create_for_data( input_data ).
    "Setting the layout
    configuration->set_layout( if_sd_config_element=>layout-grid ).

    "Setting element configuration
    configuration->get_element( 'class_name' )->set_types( VALUE #( ( `CLAS/OC` ) ) ).

    "Returning the UI information
    result = ui_information_factory->for_abap_type( abap_type     = input_data
                                                    configuration = configuration ).
  ENDMETHOD.


  METHOD if_aia_sd_action_input~get_value_help_provider.
    "Getting a reference to the value help handler via the value help provider
    "The example uses a local class as value help provider. The method implementation
    "there is intentionally empty. The value help provider is required in the example
    "for the class selection popup to display.
    result = cl_sd_value_help_provider=>create( NEW lcl_demo_abap_action_output_vh( ) ).
  ENDMETHOD.
ENDCLASS.
``` 

 </td>
</tr>

<tr>
<td> 

`ZCL_DEMO_ABAP_ACTION_OUTPUT_UI` (CCIMP include/Local Types tab in ADT)

 </td>

 <td> 


``` abap
CLASS lcl_demo_abap_action_output_vh DEFINITION.
  PUBLIC SECTION.
    INTERFACES if_sd_value_help_dsni.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.


CLASS lcl_demo_abap_action_output_vh IMPLEMENTATION.
  METHOD if_sd_value_help_dsni~get_value_help_items.
   "The method implementation is intentionally empty.
  ENDMETHOD.
ENDCLASS.
``` 

 </td>
</tr>

<tr>
<td> 

Interface to check out the IDE action<br><br>
`ZIF_DEMO_ABAP_OUTPUT` 

 </td>

 <td> 


``` abap
INTERFACE zif_demo_abap_output
  PUBLIC .
  METHODS main
    IMPORTING
      out TYPE REF TO if_demo_output_cloud.
ENDINTERFACE.
``` 

 </td>
</tr>

<tr>
<td> 

Class to check out the IDE action<br><br>
`ZCL_DEMO_ABAP` (global class) 

 </td>

 <td> 


``` abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES zif_demo_abap_output.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_demo_abap IMPLEMENTATION.
  METHOD zif_demo_abap_output~main.

    out->write_html( `<h2 style="color: green;">Displaying simple string</h2>` ).

    out->write( `Hello, this is a demo example.` ).

    out->line( ).

**********************************************************************

    out->write_html( `<h2 style="color: green;">Displaying flat structure</h2>` ).

    TYPES: BEGIN OF struc_type,
             comp1 TYPE i,
             comp2 TYPE c LENGTH 5,
             comp3 TYPE string,
             comp4 TYPE n LENGTH 5,
           END OF struc_type.

    DATA(struct) = VALUE struc_type( comp1 = 123 comp2 = 'abcde' comp3 = `This is a string` comp4 = '12345' ).

    out->write( struct ).

    out->line( ).

**********************************************************************

    out->write_html( `<h2 style="color: green;">Displaying nested structure</h2>` ).

    DATA: BEGIN OF address,
            BEGIN OF name,
              title   TYPE string VALUE `Mr.`,
              prename TYPE string VALUE `Max`,
              surname TYPE string VALUE `Mustermann`,
            END OF name,
            BEGIN OF street,
              name TYPE string VALUE `Some Street`,
              num  TYPE i VALUE 111,
            END OF street,
            BEGIN OF city,
              zipcode TYPE n LENGTH 5 VALUE `12345`,
              name    TYPE string VALUE `Some Place`,
            END OF city,
          END OF address.

    out->write( address ).

    out->line( ).

**********************************************************************

    out->write_html( `<h2 style="color: green;">Displaying internal table</h2>` ).

    SELECT * FROM I_timezone INTO TABLE @DATA(timezones) UP TO 10 ROWS.

    out->write( timezones ).

    out->line( ).

**********************************************************************

    out->write_html( `<h2 style="color: green;">Displaying complex internal table</h2>` ).

    TYPES: BEGIN OF deep_struc_type,
             comp1 TYPE i,
             comp2 TYPE c LENGTH 5,
             comp3 TYPE struc_type,
             comp4 TYPE string_table,
             comp5 TYPE TABLE OF i_timezone WITH EMPTY KEY,
             comp6 TYPE REF TO string,
           END OF deep_struc_type,
           deep_tab_type TYPE TABLE OF deep_struc_type WITH EMPTY KEY.

    DATA(deep_itab) = VALUE deep_tab_type(
      ( comp1 = 1
        comp2 = 'abc'
        comp3 = VALUE struc_type( comp1 = 123 comp2 = 'abcde' comp3 = `This is a string` comp4 = '12345' )
        comp4 = VALUE #( ( `a` ) ( `b` ) ( `c` ) )
        comp5 = VALUE #( ( LINES OF timezones TO 2 ) )
        comp6 = NEW #( `Hello` ) )
      ( comp1 = 2
        comp2 = 'def'
        comp3 = VALUE struc_type( comp1 = 456 comp2 = 'fghij' comp3 = `This is another string` comp4 = '67890' )
        comp4 = VALUE #( ( `d` ) ( `e` ) ( `f` ) )
        comp5 = VALUE #( ( LINES OF timezones FROM 3 TO 4 ) )
        comp6 = NEW #( `World` ) ) ).

    out->write( deep_itab ).

    out->line( ).

**********************************************************************

    out->write_html( `<h2 style="color: green;">Displaying references</h2>` ).

    DATA(dref_int) = NEW i( 123 ).
    out->write( dref_int ).

    DATA(dref_str) = NEW string( `Hello world` ).
    out->write( dref_str ).

    DATA(current_date) = xco_cp=>sy->date( )->as( xco_cp_time=>format->iso_8601_extended ).
    out->write( current_date ).

    out->line( ).

**********************************************************************

    out->write_html( `<h2 style="color: green;">Exploring further methods</h2>` ).

    "write_html
    out->write_html( `<h3>Test Heading</h3><p>This is some sample <span style="color: blue;">text</span>.</p><ul><li>a</li><li>b</li><li>c</li></ul>` ).

    out->begin_code( `1` ).
    "This is some code block
    ASSERT 1 = 1.
    out->end_code( `1` ).

    out->begin_section( 'Heading level 1' ).
    out->write_text( 'Lorem ipsum dolor sit amet (write_text method)' ).
    out->write( 'Lorem ipsum dolor sit amet (write method; non proportional)' ).

    out->begin_section( 'Heading level 2' ).

    "write_data method
    out->write_data( value = -100 ).

    "Applying a custom name
    out->write_data( value = -200 name = 'Custom name' ).

    "Writes with named data objects
    DATA some_num TYPE i VALUE -300.
    out->write_data( some_num ).
    out->write( some_num ).

    "exclude/include parameters
    SELECT * FROM I_timezone INTO TABLE @DATA(tz) UP TO 5 ROWS.

    out->write( tz ).
    out->write( data = tz include = `TimeZoneID, TimeZoneRule` name = `include parameter` ).
    out->write( data = tz exclude = `TimeZoneIsActive` name = `exclude parameter` ).

    out->begin_section( 'Heading level 3' ).

    "write_json
    out->write_json( /ui2/cl_json=>serialize( tz ) ).

    CALL TRANSFORMATION id SOURCE itab = tz
                           RESULT XML DATA(xml_tab).

    "write_xml
    out->write_xml( xml_tab ).

    out->end_section( ).
    out->end_section( ).
    out->end_section( ).

  ENDMETHOD.
ENDCLASS.
``` 

 </td>
</tr>

</table>

</details>  

<br>

<details>
  <summary>🟢 3) Method runner and parameter displayer </summary>
  <!-- -->
<br>
<br>

**Demo Purpose**

- This demo IDE action lets you select usable and instantiable classes, select one of their public instance or static methods, and provide the input parameters (if any) with character-like actual parameters. 
- For example, a calculator method may require three inputs: two numbers and an operator. The example focuses on basic cases and does not perform input validation at runtime.
- When you run the IDE action, the method is executed. 
- As a result, the parameter table (refer to the Dynamic Programming cheat sheet) is displayed as HTML in the IDE action result dialog using `CL_DEMO_OUTPUT_CLOUD`, including any of the input and output parameters and their values (if any).


**Steps**
 
- Access your demo package in ADT in your SAP BTP ABAP Environment.
- Create a new repository object by, e.g. right-clicking the package and choosing *New -> Other ABAP Repository Object -> Filter for IDE Action*.
- Action creation: 
  - Name: *ZDEMO_ABAP_IDE_ACTION_M_RUN*
  - Description: *IDE Action for Method Running and Parameter Displaying*
- Make the following entries on the IDE Action screen: 
  - Title: Demo IDE Action: Method Run
  - Summary: Action to run public instance and static class methods and display the content of parameters as HTML in an IDE action pop-up 
  - Implementing Class: `ZCL_DEMO_ABAP_ACTION_METHODRUN`
  - Input UI Configuration Class: `ZCL_DEMO_ABAP_ACTION_M_RUN_UI`
  - Number of Focused Resources: Any
  - Filter Object Types: `CLAS`
- Create the classes (see the description on the steps in the first expandable section).
- Create a demo class named `ZCL_DEMO_ABAP` to check out the IDE action.
- For the classes, you can use the code below.
- To check out the demo IDE action, proceed as follows:   
  - In ADT, you have opened the demo class `ZCL_DEMO_ABAP` (or any class implementing the interface).
  - Choose *STR + ALT/CMD + R* to run an IDE action.
  - Select the IDE action. You can filter for *Method Run*.
  - Choose *Run*.
  - An IDE action dialog is displayed prompting you to provide a class. 
  - Once you have provided the class name, you can choose *Browse* for *Public Method*. Select the method you want to call.
  - If the selected method has input parameters, they are displayed in the *Method Input Parameters* section.
  - To provide actual parameters for the formal parameters, select the line and choose *Edit*. You can then provide input for *Value*.
  - Choose *Run*.
  - The IDE action result dialog is displayed showing the HTML output of the parameter table (if any), i.e. also possible output parameters and their content.  

<table>

<tr>
<th> Class (include) </th> <th> Code </th>
</tr>

<tr>
<td> 

`ZCL_DEMO_ABAP_ACTION_METHODRUN` (global class; no code in other includes)

 </td>

 <td> 


``` abap
CLASS zcl_demo_abap_action_methodrun DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_aia_action.
  PROTECTED SECTION.
  PRIVATE SECTION.
    CLASS-METHODS get_output IMPORTING VALUE(ui_input) TYPE zcl_demo_abap_action_m_run_ui=>ty_input
                             RETURNING VALUE(result)   TYPE string.

    CLASS-DATA ptab TYPE abap_parmbind_tab.
    CLASS-DATA dref TYPE REF TO data.
    TYPES: BEGIN OF p_struct,
             parameter TYPE string,
             dref      TYPE REF TO data,
           END OF p_struct.
    CLASS-DATA tab TYPE TABLE OF p_struct WITH EMPTY KEY.
    CLASS-DATA html TYPE string.
ENDCLASS.



CLASS zcl_demo_abap_action_methodrun IMPLEMENTATION.

  METHOD get_output.

    ui_input-class_name = condense( val = to_upper( ui_input-class_name ) to = `` ).

    "The example is set up to allow only your own Z classes
*    FIND PCRE `\AZ` IN ui_input-class_name.
*    IF sy-subrc <> 0.
*      result = |The example IDE action is set up to only process Z classes|.
*      RETURN.
*    ENDIF.
*
*    DATA(created_by) = xco_cp_abap=>class( CONV #( ui_input-class_name ) )->get_created_by( ).
*    IF created_by <> sy-uname.
*      result = |Class { ui_input-class_name } is not created by you. The example IDE action is set up to only process your own Z classes|.
*      RETURN.
*    ENDIF.

    cl_abap_classdescr=>describe_by_name(
      EXPORTING
        p_name         = ui_input-class_name
      RECEIVING
        p_descr_ref    = DATA(tdo)
      EXCEPTIONS
        type_not_found = 1
        OTHERS         = 2 ).

    IF sy-subrc <> 0.
      result = |Class { ui_input-class_name } not found|.
      RETURN.
    ENDIF.

    DATA(tdo_cl) = CAST cl_abap_classdescr( tdo ).

    "Checking whether the method is available
    DATA(methods) = tdo_cl->methods.
    READ TABLE methods ASSIGNING FIELD-SYMBOL(<meth>) WITH KEY name = ui_input-method_name.

    IF sy-subrc <> 0.
      result = |Method { ui_input-method_name } not available|.
      RETURN.
    ENDIF.

    "Checking that the method is not one of the constructurs
    IF <meth>-name = 'CLASS_CONSTRUCTOR' OR <meth>-name = 'CONSTRUCTOR'.
      result = |Constructors cannot be called|.
      RETURN.
    ENDIF.

    "Checking that the method is not the main method of the if_oo_adt_classrun interface
    IF <meth>-name = 'IF_OO_ADT_CLASSRUN~MAIN'.
      result = |The IF_OO_ADT_CLASSRUN~MAIN method cannot be called|.
      RETURN.
    ENDIF.

    "Checking that the method is not abstract
    IF <meth>-is_abstract = abap_true.
      result = |Method { ui_input-method_name } is abstract|.
      RETURN.
    ENDIF.

    "Checking that the method is public
    IF <meth>-visibility <> 'U'.
      result = |Method { ui_input-method_name } is not public|.
      RETURN.
    ENDIF.

    "Checking whether the class is instantiatable and instance methods can be called
    IF <meth>-is_class = abap_false AND tdo->is_instantiatable( ) = abap_false.
      result = |Instance method { ui_input-method_name } cannot be called because { ui_input-class_name } cannot be instantiated|.
      RETURN.
    ENDIF.

    "Processing method parameters
    TRY.
        LOOP AT <meth>-parameters ASSIGNING FIELD-SYMBOL(<m>).
          DATA(param_type) = tdo_cl->get_method_parameter_type( p_method_name    = ui_input-method_name
                                                                p_parameter_name = <m>-name  ).

          "Checking types and creating data objects dynamically
          CASE TYPE OF param_type.
            WHEN TYPE cl_abap_tabledescr.
              DATA(table_tdo) = CAST cl_abap_tabledescr( param_type ).
              CASE table_tdo->table_kind.
                WHEN cl_abap_tabledescr=>tablekind_any.
                  CREATE DATA dref TYPE string_table.
                WHEN cl_abap_tabledescr=>tablekind_index.
                  CREATE DATA dref TYPE string_table.
                WHEN cl_abap_tabledescr=>tablekind_std.
                  IF table_tdo->is_instantiatable( ) = abap_true AND table_tdo->get_relative_name( ) IS NOT INITIAL.
                    CREATE DATA dref TYPE HANDLE param_type.
                  ELSE.
                    CREATE DATA dref TYPE string_table.
                  ENDIF.
                WHEN cl_abap_tabledescr=>tablekind_hashed.
                  IF table_tdo->is_instantiatable( ) = abap_true AND table_tdo->get_relative_name( ) IS NOT INITIAL.
                    CREATE DATA dref TYPE HANDLE param_type.
                  ELSE.
                    CREATE DATA dref TYPE string_hashed_table.
                  ENDIF.
                WHEN cl_abap_tabledescr=>tablekind_sorted.
                  IF table_tdo->is_instantiatable( ) = abap_true AND table_tdo->get_relative_name( ) IS NOT INITIAL.
                    CREATE DATA dref TYPE HANDLE param_type.
                  ELSE.
                    TYPES sorted_tab TYPE SORTED TABLE OF string WITH NON-UNIQUE KEY table_line.
                    CREATE DATA dref TYPE sorted_tab.
                  ENDIF.
              ENDCASE.
            WHEN TYPE cl_abap_elemdescr.
              DATA(elem_tdo) = CAST cl_abap_elemdescr( param_type ).
              CASE elem_tdo->type_kind.
                WHEN cl_abap_typedescr=>typekind_numeric.
                  IF elem_tdo->is_instantiatable( ) = abap_true.
                    CREATE DATA dref TYPE HANDLE param_type.
                  ELSE.
                    CREATE DATA dref TYPE i.
                  ENDIF.
                WHEN cl_abap_typedescr=>typekind_char.
                  IF elem_tdo->is_instantiatable( ) = abap_true.
                    CREATE DATA dref TYPE HANDLE param_type.
                  ELSE.
                    CREATE DATA dref TYPE c LENGTH 10.
                  ENDIF.
                WHEN cl_abap_typedescr=>typekind_clike.
                  IF elem_tdo->is_instantiatable( ) = abap_true.
                    CREATE DATA dref TYPE HANDLE param_type.
                  ELSE.
                    CREATE DATA dref TYPE c LENGTH 10.
                  ENDIF.
                WHEN cl_abap_typedescr=>typekind_csequence.
                  IF elem_tdo->is_instantiatable( ) = abap_true.
                    CREATE DATA dref TYPE HANDLE param_type.
                  ELSE.
                    CREATE DATA dref TYPE c LENGTH 10.
                  ENDIF.
                WHEN cl_abap_typedescr=>typekind_num.
                  IF elem_tdo->is_instantiatable( ) = abap_true.
                    CREATE DATA dref TYPE HANDLE param_type.
                  ELSE.
                    CREATE DATA dref TYPE n LENGTH 10.
                  ENDIF.
                WHEN cl_abap_typedescr=>typekind_hex.
                  IF elem_tdo->is_instantiatable( ) = abap_true.
                    CREATE DATA dref TYPE HANDLE param_type.
                  ELSE.
                    CREATE DATA dref TYPE x LENGTH 10.
                  ENDIF.
                WHEN cl_abap_typedescr=>typekind_xsequence.
                  IF elem_tdo->is_instantiatable( ) = abap_true.
                    CREATE DATA dref TYPE HANDLE param_type.
                  ELSE.
                    CREATE DATA dref TYPE xstring.
                  ENDIF.
                WHEN cl_abap_typedescr=>typekind_decfloat.
                  IF elem_tdo->is_instantiatable( ) = abap_true.
                    CREATE DATA dref TYPE HANDLE param_type.
                  ELSE.
                    CREATE DATA dref TYPE decfloat34.
                  ENDIF.
                WHEN cl_abap_typedescr=>typekind_packed.
                  IF elem_tdo->is_instantiatable( ) = abap_true.
                    CREATE DATA dref TYPE HANDLE param_type.
                  ELSE.
                    CREATE DATA dref TYPE p LENGTH 16 DECIMALS 14.
                  ENDIF.
                WHEN cl_abap_typedescr=>typekind_any.
                  IF elem_tdo->is_instantiatable( ) = abap_true.
                    CREATE DATA dref TYPE HANDLE param_type.
                  ELSE.
                    CREATE DATA dref TYPE string.
                  ENDIF.
                WHEN cl_abap_typedescr=>typekind_data.
                  IF elem_tdo->is_instantiatable( ) = abap_true.
                    CREATE DATA dref TYPE HANDLE param_type.
                  ELSE.
                    CREATE DATA dref TYPE string.
                  ENDIF.
                WHEN cl_abap_typedescr=>typekind_simple.
                  IF elem_tdo->is_instantiatable( ) = abap_true.
                    CREATE DATA dref TYPE HANDLE param_type.
                  ELSE.
                    CREATE DATA dref TYPE c LENGTH 10.
                  ENDIF.
              ENDCASE.
            WHEN OTHERS.
              CREATE DATA dref TYPE HANDLE param_type.
          ENDCASE.

          IF dref IS NOT BOUND.
            CREATE DATA dref TYPE HANDLE param_type.
          ENDIF.

          "Preparing parameter table
          APPEND VALUE #( parameter = <m>-name dref = dref ) TO tab ASSIGNING FIELD-SYMBOL(<val>).

          IF <m>-parm_kind = 'I' OR <m>-parm_kind = 'C'.
            DATA(type_descr) = cl_abap_typedescr=>describe_by_data( dref->* ).

            IF type_descr IS INSTANCE OF cl_abap_elemdescr.
              TRY.
                  <val>-dref->* = VALUE #( ui_input-parameters[ parameter = <m>-name ]-value OPTIONAL ).
                CATCH cx_root.
              ENDTRY.
            ELSE.
              "In case of non-elementary types, assigning initial value.
              TRY.
                  IF <m>-parm_kind = 'R'.
                    <val>-dref->* = dref.
                  ELSE.
                    <val>-dref->* = dref->*.
                  ENDIF.
                CATCH cx_root.
              ENDTRY.

            ENDIF.
          ENDIF.
          UNASSIGN <val>.

          INSERT VALUE #( name = <m>-name
                          kind = COND #( WHEN <m>-parm_kind = cl_abap_objectdescr=>importing THEN cl_abap_objectdescr=>exporting
                                         WHEN <m>-parm_kind = cl_abap_objectdescr=>exporting THEN cl_abap_objectdescr=>importing
                                         WHEN <m>-parm_kind = cl_abap_objectdescr=>changing THEN cl_abap_objectdescr=>changing
                                         WHEN <m>-parm_kind = cl_abap_objectdescr=>returning THEN cl_abap_objectdescr=>returning )
                          value = tab[ parameter = <m>-name ]-dref ) INTO TABLE ptab.
          CLEAR dref.
        ENDLOOP.

        "Calling methods and preparing output
        DATA(output_oref) = cl_demo_output_cloud=>new( cl_demo_output_cloud=>html ).
        IF <meth>-is_class = abap_true.
          CALL METHOD (ui_input-class_name)=>(ui_input-method_name) PARAMETER-TABLE ptab.
          IF ptab IS INITIAL.
            result = `**** Nothing to display ****`.
          ELSE.
            result = output_oref->get( ptab ).
          ENDIF.
        ELSE.
          DATA oref TYPE REF TO object.
          CREATE OBJECT oref TYPE (ui_input-class_name).
          CALL METHOD oref->(ui_input-method_name) PARAMETER-TABLE ptab.
          IF ptab IS INITIAL.
            result = `**** Nothing to display ****`.
          ELSE.
            result = output_oref->get( ptab ).
          ENDIF.
        ENDIF.
      CATCH cx_root INTO DATA(error).
        result = error->get_text( ).
    ENDTRY.
  ENDMETHOD.

  METHOD if_aia_action~run.
    DATA(popup_result) = cl_aia_result_factory=>create_html_popup_result( ).

    TRY.
        DATA ui_input TYPE zcl_demo_abap_action_m_run_ui=>ty_input.
        context->get_input_config_content( )->get_as_structure( IMPORTING result = ui_input ).
      CATCH cx_sd_invalid_data INTO DATA(exception).
        CLEAR ui_input.
        popup_result->set_content( exception->get_text( ) ).
        result = popup_result.
        RETURN.
    ENDTRY.

    popup_result->set_content( get_output( ui_input = ui_input ) ).
    result = popup_result.
  ENDMETHOD.
ENDCLASS.
``` 

 </td>
</tr>

<tr>
<td> 

`ZCL_DEMO_ABAP_ACTION_M_RUN_UI` (global class)

 </td>

 <td> 


``` abap
CLASS zcl_demo_abap_action_m_run_ui DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_aia_sd_action_input.

    TYPES:
      "! <p class="shorttext">Input Parameters</p>
      BEGIN OF ty_table_row,
        "! <p class="shorttext">Parameter</p>
        parameter TYPE c LENGTH 30,
        "! <p class="shorttext">Value</p>
        value     TYPE string,
      END OF ty_table_row,

      ty_table TYPE STANDARD TABLE OF ty_table_row WITH DEFAULT KEY,

      "! <p class="shorttext">Provide class and method parameter values</p>
      BEGIN OF ty_input,
        "! <p class="shorttext">Class Name</p>
        class_name  TYPE string,
        "! <p class="shorttext">Public Method</p>
        method_name TYPE string,
        "! <p class="shorttext">Method Input Parameters</p>
        parameters  TYPE ty_table,
      END OF ty_input.

  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.



CLASS zcl_demo_abap_action_m_run_ui IMPLEMENTATION.

  METHOD if_aia_sd_action_input~create_input_config.
    TRY.
        DATA(resource) = CAST if_adt_context_src_based_obj( context->get_focused_resource( ) ).
        DATA(focused_resources) = context->get_focused_resources( ).
        LOOP AT focused_resources ASSIGNING FIELD-SYMBOL(<focused_resource>).
          IF <focused_resource>->get_kind( ) = if_adt_context_resource=>kind-source_based_dev_object.
            DATA(source_based_object) = CAST if_adt_context_src_based_obj( <focused_resource> ).
            DATA(cl) = source_based_object->get_object_info( )-display_name.
            DATA(type) = <focused_resource>->get_type( ).
            IF type = `CLAS/OC`.
              DATA(ok) = abap_true.
              EXIT.
            ENDIF.
          ENDIF.
        ENDLOOP.
      CATCH cx_root.
    ENDTRY.

    "Default values for input data
    DATA(input_data) = VALUE ty_input( class_name = cl ).

    "Creating the configuration
    DATA(configuration) = ui_information_factory->get_configuration_factory(
                                               )->create_for_data( input_data ).
    "Setting the layout
    configuration->set_layout( if_sd_config_element=>layout-grid ).

    "Setting element and table configuration
    configuration->get_element( 'class_name' )->set_types( VALUE #( ( `CLAS/OC` ) ) ).
    configuration->get_element( 'method_name' )->set_values( if_sd_config_element=>values_kind-domain_specific_named_items ).
    DATA(parameters) = configuration->get_structured_table( 'parameters' ).
    parameters->set_layout( if_sd_config_element=>layout-table ).
    parameters->if_sd_config_element~set_read_only( abap_true ).
    parameters->get_line_structure( )->if_sd_config_element~set_read_only( abap_false ).
    parameters->get_line_structure( )->get_element( 'parameter' )->set_read_only( abap_true ).
    configuration->get_element( 'class_name' )->set_sideeffect( after_update = abap_true ).
    configuration->get_element( 'method_name' )->set_sideeffect( after_update = abap_true ).

    "Setting side effect on the table
    parameters->get_line_structure( )->set_sideeffect( before_create   = abap_true
                                                       feature_control = abap_true ).

    "Returning the UI information
    result = ui_information_factory->for_abap_type( abap_type     = input_data
                                                    configuration = configuration ).
  ENDMETHOD.


  METHOD if_aia_sd_action_input~get_side_effect_provider.
    "Getting a reference to the side effect handler via the side effect provider
    "The example uses a local class as side effect provider.
    result = cl_sd_sideeffect_provider=>create( feature_control = NEW lcl_demo_abap_action_m_run_se( )
                                                determination   = NEW lcl_demo_abap_action_m_run_se( ) ).
  ENDMETHOD.


  METHOD if_aia_sd_action_input~get_value_help_provider.
    "Getting a reference to the value help handler via the value help provider
    "The example uses a local class as value help provider.
    result = cl_sd_value_help_provider=>create( NEW lcl_demo_abap_action_m_run_vh( ) ).
  ENDMETHOD.
ENDCLASS.
``` 

 </td>
</tr>

<tr>
<td> 

`ZCL_DEMO_ABAP_ACTION_M_RUN_UI` (CCIMP include/Local Types tab in ADT)

 </td>

 <td> 


``` abap
*&---------------------------------------------------------------------*
*& Value help handler
*&---------------------------------------------------------------------*

CLASS lcl_demo_abap_action_m_run_vh DEFINITION.
  PUBLIC SECTION.
    INTERFACES if_sd_value_help_dsni.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS lcl_demo_abap_action_m_run_vh IMPLEMENTATION.

  METHOD if_sd_value_help_dsni~get_value_help_items.
    DATA items TYPE STANDARD TABLE OF if_sd_value_help_dsni=>ty_named_item.

    IF model->get_data_type_name( ) = 'ZCL_DEMO_ABAP_ACTION_M_RUN_UI=>TY_INPUT'.
      DATA creation_model TYPE zcl_demo_abap_action_m_run_ui=>ty_input.
      model->get_as_structure( IMPORTING result = creation_model ).
      DATA(tdo_cl) = CAST cl_abap_classdescr( cl_abap_typedescr=>describe_by_name( creation_model-class_name ) ).
      DATA(methods_cl) = tdo_cl->methods.

      LOOP AT methods_cl INTO DATA(wa) WHERE is_abstract = abap_false AND visibility = 'U'.
        APPEND VALUE #( name = wa-name ) TO items.
      ENDLOOP.

      DELETE items WHERE name = 'CLASS_CONSTRUCTOR'.
      DELETE items WHERE name = 'CONSTRUCTOR'.
      DELETE items WHERE name = 'IF_OO_ADT_CLASSRUN~MAIN'.
    ENDIF.

    DELETE items WHERE name NOT IN search_pattern_range.
    WHILE lines( items ) > max_item_count.
      DELETE items INDEX lines( items ).
    ENDWHILE.

    "Returning the value help items
    result = VALUE #( items            = items
                      total_item_count = lines( items ) ).
  ENDMETHOD.
ENDCLASS.

*&---------------------------------------------------------------------*
*& Side effect handler
*&---------------------------------------------------------------------*

CLASS lcl_demo_abap_action_m_run_se DEFINITION.
  PUBLIC SECTION.
    INTERFACES:
      if_sd_determination,
      if_sd_feature_control.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.


CLASS lcl_demo_abap_action_m_run_se IMPLEMENTATION.

  METHOD if_sd_determination~run.
    DATA(input_data) = VALUE zcl_demo_abap_action_m_run_ui=>ty_input( ).
    model->get_as_structure( IMPORTING result = input_data ).
    DATA(table_path) = path->get_as_table( ).

    IF id = 'CLASS_NAME' AND determination_kind = if_sd_determination=>kind-after_update.
      CLEAR input_data-method_name.
      CLEAR input_data-parameters.
    ENDIF.

    IF id = 'METHOD_NAME' AND determination_kind = if_sd_determination=>kind-after_update.
      CLEAR input_data-parameters.
      DATA creation_model TYPE zcl_demo_abap_action_m_run_ui=>ty_input.
      model->get_as_structure( IMPORTING result = creation_model ).
      DATA(tdo_cl) = CAST cl_abap_classdescr( cl_abap_typedescr=>describe_by_name( creation_model-class_name ) ).
      DATA(methods_cl) = tdo_cl->methods.
      TRY.
          DATA(meth) = methods_cl[ name = creation_model-method_name ].
          LOOP AT meth-parameters INTO DATA(param).
            IF param-parm_kind = cl_abap_objectdescr=>importing OR param-parm_kind = cl_abap_objectdescr=>changing.
              APPEND VALUE #( parameter = param-name ) TO input_data-parameters.
            ENDIF.
          ENDLOOP.
        CATCH cx_sy_itab_line_not_found.
      ENDTRY.
    ENDIF.

    result = input_data.
  ENDMETHOD.

  METHOD if_sd_feature_control~run.
    DATA(input_data) = VALUE zcl_demo_abap_action_m_run_ui=>ty_input( ).
    model->get_as_structure( IMPORTING result = input_data ).
    DATA(feature_control) = feature_control_factory->create_for_data( input_data ).

    IF feature_control_kind = if_sd_feature_control=>kind-on_create.
      feature_control->get_structured_table( 'parameters'
                    )->get_line_structure(
                    )->get_element( 'value'
                    )->set_disabled( ).
    ENDIF.

    result = feature_control.
  ENDMETHOD.

ENDCLASS.
``` 

 </td>
</tr>


<tr>
<td> 

Class to check out the IDE action<br><br>
`ZCL_DEMO_ABAP` (global class) 

 </td>

 <td> 

- As an example, select the `stat_meth_calc` method that represents a simple calculator method, expecting three input parameters to be provided with actual parameters.
- Note the simplified demo implementation. For example, the `stat_meth_all_params` method involves importing, exporting, changing and returning parameters. The changing parameter `number` expects a value of type `decfloat34`. If you provide a nonsensical character value through the IDE action, like *Test input* or others which cannot be converted, the method will not be able to process it. Or you provide a number that exceeds the maximum value for integers (parameters typed with `i`). In such situations,  initial or demo values are automatically used to ensure the method call works.


<br>

``` abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.

    TYPES: BEGIN OF elem_struc,
             int     TYPE i,
             int8    TYPE int8,
             dec16   TYPE decfloat16,
             dec34   TYPE decfloat34,
             float   TYPE f,
             c1      TYPE c LENGTH 1,
             c20     TYPE c LENGTH 20,
             n5      TYPE n LENGTH 5,
             string  TYPE string,
             pl8d2   TYPE p LENGTH 8 DECIMALS 2,
             pl16d14 TYPE p  LENGTH 16 DECIMALS 14,
             x4      TYPE x LENGTH 4,
             xstring TYPE xstring,
           END OF elem_struc.

    CLASS-METHODS stat_meth_all_params
      IMPORTING text           TYPE string
      EXPORTING uppercase_text TYPE string
      CHANGING  number         TYPE decfloat34
      RETURNING VALUE(result)  TYPE string.

    CLASS-METHODS inst_meth_all_params
      IMPORTING text           TYPE string
      EXPORTING uppercase_text TYPE string
      CHANGING  number         TYPE decfloat34
      RETURNING VALUE(result)  TYPE string.

    CLASS-METHODS stat_meth_calc
      IMPORTING num1          TYPE i
                operator      TYPE elem_struc-c1
                num2          TYPE i
      RETURNING VALUE(result) TYPE string.

    CLASS-METHODS stat_meth_no_importing
      RETURNING
        VALUE(result) TYPE string.

    CLASS-METHODS stat_meth_no_params.

    CLASS-METHODS stat_meth_mult_elem_imp_params
      IMPORTING num_i              TYPE elem_struc-int
                num_int8           TYPE elem_struc-int8
                dec16              TYPE elem_struc-dec16
                dec34              TYPE elem_struc-dec34
                float              TYPE elem_struc-float
                pl8d2              TYPE elem_struc-pl8d2
                pl16d14            TYPE elem_struc-pl16d14
                str                TYPE elem_struc-string
                c1                 TYPE elem_struc-c1
                c20                TYPE elem_struc-c20
                n5                 TYPE elem_struc-n5
                x4                 TYPE elem_struc-x4
                xstr               TYPE elem_struc-xstring
      RETURNING VALUE(elem_values) TYPE elem_struc.

    CLASS-METHODS stat_meth_mult_params
      IMPORTING text          TYPE string
      EXPORTING upper_text    TYPE string
                lower_text    TYPE string
      CHANGING  str           TYPE string
      RETURNING VALUE(result) TYPE string.

    CLASS-METHODS stat_meth_generic_imp_par
      IMPORTING any           TYPE any
                data          TYPE data
                c             TYPE c
                clike         TYPE clike
                csequence     TYPE csequence
                n             TYPE n
                x             TYPE x
                xsequence     TYPE xsequence
                dec           TYPE decfloat
                numeric       TYPE numeric
                p             TYPE p
                simple        TYPE simple
      RETURNING VALUE(result) TYPE string_table.

    METHODS inst_meth_mult_params
      IMPORTING text          TYPE string
      EXPORTING upper_text    TYPE string
                lower_text    TYPE string
      CHANGING  str           TYPE string
      RETURNING VALUE(result) TYPE string.

    CLASS-METHODS inst_meth_mult_elem_imp_params
      IMPORTING num_i              TYPE elem_struc-int
                num_int8           TYPE elem_struc-int8
                dec16              TYPE elem_struc-dec16
                dec34              TYPE elem_struc-dec34
                float              TYPE elem_struc-float
                pl8d2              TYPE elem_struc-pl8d2
                pl16d14            TYPE elem_struc-pl16d14
                str                TYPE elem_struc-string
                c1                 TYPE elem_struc-c1
                c20                TYPE elem_struc-c20
                n5                 TYPE elem_struc-n5
                x4                 TYPE elem_struc-x4
                xstr               TYPE elem_struc-xstring
      RETURNING VALUE(elem_values) TYPE elem_struc.

  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.



CLASS zcl_demo_abap IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    out->write( 'hello' ).
  ENDMETHOD.

  METHOD stat_meth_no_importing.
    result = `Hello world`.
  ENDMETHOD.

  METHOD stat_meth_no_params.
    ...
  ENDMETHOD.

  METHOD stat_meth_mult_elem_imp_params.
    elem_values = VALUE #( int  = num_i
                           int8   = num_int8
                           dec16 = dec16
                           dec34 = dec34
                           float = float
                           pl8d2 = pl8d2
                           pl16d14 = pl16d14
                           string = str
                           c1 = c1
                           c20 = c20
                           n5 = n5
                           x4 = x4
                           xstring = xstr ).
  ENDMETHOD.

  METHOD stat_meth_generic_imp_par.
    APPEND LINES OF VALUE string_table( ( |any: { any }| )
                                        ( |data: { data }| )
                                        ( |c: { c }| )
                                        ( |clike: { clike }| )
                                        ( |csequence: { csequence }| )
                                        ( |n: { n }| )
                                        ( |x: { x }| )
                                        ( |xsequence: { xsequence }| )
                                        ( |dec: { dec }| )
                                        ( |numeric: { numeric }| )
                                        ( |p: { p }| )
                                        ( |simple: { simple }| ) ) TO result.
  ENDMETHOD.

  METHOD stat_meth_mult_params.
    upper_text = to_upper( text ).
    lower_text = to_lower( text ).
    str = reverse( str ).
    result = |upper_text = "{ upper_text }"; lower_text = "{ lower_text }"|.
  ENDMETHOD.

  METHOD inst_meth_mult_params.
    upper_text = to_upper( text ).
    lower_text = to_lower( text ).
    str = reverse( str ).
    result = |upper_text = "{ upper_text }"; lower_text = "{ lower_text }"|.
  ENDMETHOD.

  METHOD inst_meth_mult_elem_imp_params.
    elem_values = VALUE #( int  = num_i
                           int8   = num_int8
                           dec16 = dec16
                           dec34 = dec34
                           float = float
                           pl8d2 = pl8d2
                           pl16d14 = pl16d14
                           string = str
                           c1 = c1
                           c20 = c20
                           n5 = n5
                           x4 = x4
                           xstring = xstr ).
  ENDMETHOD.

  METHOD stat_meth_calc.
    CASE operator.
      WHEN '+'.
        result = num1 + num2.
      WHEN '-'.
        result = num1 - num2.
      WHEN '/'.
        result = num1 / num2.
      WHEN '*'.
        result = num1 * num2.
      WHEN OTHERS.
        result = `Calculation not possible`.
    ENDCASE.

  ENDMETHOD.

  METHOD inst_meth_all_params.
    uppercase_text = to_upper( text ).
    DATA(number_copy) = number.
    number += 1.
    result = |IMPORTING text = "{ text }" / EXPORTING uppercase_text = "{ uppercase_text }" / CHANGING number = "{ number }" (Original value = "{ number_copy }")|.
  ENDMETHOD.

  METHOD stat_meth_all_params.
    uppercase_text = to_upper( text ).
    DATA(number_copy) = number.
    number += 1.
    result = |IMPORTING text = "{ text }" / EXPORTING uppercase_text = "{ uppercase_text }" / CHANGING number = "{ number }" (Original value = "{ number_copy }")|.
  ENDMETHOD.

ENDCLASS.

``` 

 </td>
</tr>

</table>

</details>  

<br>

<details>
  <summary>🟢 4) XLSX file importer and content displayer </summary>
  <!-- -->
<br>


**Demo Purpose**

- The demo IDE action lets you select an XLSX file from your local machine, retrieve its content, and display it in an internal table as HTML using `CL_DEMO_OUTPUT_CLOUD` in the IDE action result dialog.  
- In the selection IDE action dialog, you can specify which worksheet contains the content to retrieve. You can also choose where to start retrieving the content (e.g., from column A, row 1) and indicate if there is a header line. If a header exists, the content of that cells in that line are used as field names for the internal table.  
- When you run the IDE action, the XCO API is used to read the XLSX content. An internal table is created dynamically, and the worksheet content is added to it. Finally, this internal table is displayed as HTML in the IDE action result dialog.  


**Steps**

- Access your demo package in ADT in your SAP BTP ABAP Environment.
- Create a new repository object by, e.g. right-clicking the package and choosing *New -> Other ABAP Repository Object -> Filter for IDE Action*.
- Action creation: 
  - Name: *ZDEMO_ABAP_IDE_ACTION_IMPORT*
  - Description: *IDE Action for XLSX file import*
- Make the following entries on the IDE Action screen: 
  - Title: Demo IDE Action: File Importer
  - Summary: Action to import XLSX files and display the content in an internal table in an IDE action pop-up 
  - Implementing Class: `ZCL_DEMO_ABAP_ACTION_IMPORT`
  - Input UI Configuration Class: `ZCL_DEMO_ABAP_ACTION_IMPORT_UI`
  - Number of Focused Resources: Any
  - Filter Object Types: `CLAS` (choose *Add* and filter for `CLAS`)
- Create the classes (see the description on the steps in the first expandable section). 
- You do not need a demo class named `ZCL_DEMO_ABAP` to check out the IDE action for this example.
- For the classes, you can use the code below. The table below also contains demo content you can provide your demo worksheet with.
- To check out the demo IDE action, proceed as follows:   
  - In ADT, you have opened a class (no particular class).
  - Choose *STR + ALT/CMD + R* to run an IDE action.
  - Select the IDE action. You can filter for *File import*.
  - Choose *Run*.
  - An IDE action dialog is displayed prompting you to provide a path to an XLSX file on your local machine. 
  - The assumption is that a very simple worksheet is imported, for example, the content is available in the first worksheet and has a *header line*. The content starts at column A in row 1. If the content does not include a header line, you can select the checkbox. If the content starts elsewhere in the sheet (e.g. at column C, row 3), you can make the appropriate entry. 
    - The table below includes descriptions for demonstrations.
  - Choose *Run*.
  - If the XLSX content processing is successful, the IDE action result dialog will display the XLSX content in an internal table, presented as HTML table. 

> [!WARNING]  
> Since the example IDE action lets you import a local file, be mindful of the potential security risks when importing external content. Refer to [this repository's disclaimer](./README.md#%EF%B8%8F-disclaimer) and to [the disclaimer in the documentation about XCO](https://help.sap.com/docs/btp/sap-business-technology-platform/xlsx-read-access).


<table>

<tr>
<th> Subject/Class </th> <th> Notes/Code </th>
</tr>

<tr>
<td> 

`ZCL_DEMO_ABAP_ACTION_IMPORT` (global class; no code in other includes)

 </td>

 <td> 


``` abap
CLASS zcl_demo_abap_action_import DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_aia_action.
  PROTECTED SECTION.
  PRIVATE SECTION.
    METHODS process_file_content
      IMPORTING ui_input      TYPE zcl_demo_abap_action_import_ui=>ty_input
      RETURNING VALUE(result) TYPE REF TO data.
    METHODS get_input_as_html
      IMPORTING ui_input      TYPE zcl_demo_abap_action_import_ui=>ty_input
      RETURNING VALUE(result) TYPE string.
    CONSTANTS error TYPE string VALUE `Cannot process input (e.g. column/row values are invalid for the selected file)`.
ENDCLASS.



CLASS zcl_demo_abap_action_import IMPLEMENTATION.
  METHOD get_input_as_html.
    DATA(output_oref) = cl_demo_output_cloud=>new( cl_demo_output_cloud=>html ).
    DATA(ref) = process_file_content( ui_input ).
    IF ref IS BOUND.
      result = output_oref->get( ref->* ).
    ELSE.
      result = output_oref->get( error ).
    ENDIF.
  ENDMETHOD.

  METHOD if_aia_action~run.
    TRY.
        DATA ui_input TYPE zcl_demo_abap_action_import_ui=>ty_input.
        context->get_input_config_content( )->get_as_structure( IMPORTING result = ui_input ).
      CATCH cx_sd_invalid_data INTO DATA(exception).
        CLEAR ui_input.
    ENDTRY.

    "Creating HTML popup
    DATA(popup_result) = cl_aia_result_factory=>create_html_popup_result( ).
    popup_result->set_content( get_input_as_html( ui_input ) ).
    result = popup_result.
  ENDMETHOD.


  METHOD process_file_content.
    TRY.
        DATA(val) = ui_input-path_text_field.
        "Decoding XLSX file input
        DATA(xlsx_content) = cl_web_http_utility=>decode_x_base64( ui_input-path_text_field ).
        DATA(xlsx_doc) = xco_cp_xlsx=>document->for_file_content( xlsx_content ).

        "Getting read access to XLSX content
        DATA(read_xlsx) = xlsx_doc->read_access( ).
        "Worksheet selection
        DATA(worksheet) = read_xlsx->get_workbook( )->worksheet->at_position( COND #( WHEN ui_input-worksheet_number < 1 THEN 1 ELSE ui_input-worksheet_number ) ).
        TRY.
            DATA(cursor) = worksheet->cursor(
              io_column = xco_cp_xlsx=>coordinate->for_alphabetic_value( COND #( WHEN ui_input-start_column IS INITIAL THEN `A` ELSE to_upper( ui_input-start_column ) ) )
              io_row    = xco_cp_xlsx=>coordinate->for_numeric_value( COND #( WHEN ui_input-start_row < 1 THEN 1 ELSE ui_input-start_row ) ) ).
          CATCH cx_root.
            result = REF #( error ).
            RETURN.
        ENDTRY.

        "Preparing table column names
        DATA column_names TYPE string_table.
        WHILE cursor->has_cell( ) = abap_true AND cursor->get_cell( )->has_value( ) = abap_true.
          DATA(cell) = cursor->get_cell( ).
          DATA(string_value) = ``.

          IF ui_input-no_table_header = abap_true.
            string_value = cursor->position->column->get_alphabetic_value( ).
          ELSE.
            cell->get_value(
              )->set_transformation( xco_cp_xlsx_read_access=>value_transformation->string_value
              )->write_to( REF #( string_value ) ).
          ENDIF.

          APPEND string_value TO column_names.

          TRY.
              cursor->move_right( ).
            CATCH cx_xco_runtime_exception.
              EXIT.
          ENDTRY.
        ENDWHILE.

        IF column_names IS INITIAL.
          result = REF #( `Cannot process input (e.g. column/row values are invalid for the file)` ).
          RETURN.
        ENDIF.

        "Creating a table type dynamically
        "The loop implementation includes name preparations so that they can be used as component names.
        DATA components TYPE cl_abap_structdescr=>component_table.
        LOOP AT column_names REFERENCE INTO DATA(wa).
          wa->* = condense( val = wa->* to = `` ).
          wa->* = replace( val = wa->* pcre = `\W` with = `` occ = 0 ).
          wa->* = replace( val = wa->* pcre = `^(\d)` with = `_$1` ).
          APPEND VALUE #( name = wa->* type = cl_abap_elemdescr=>get_string( ) ) TO components.
        ENDLOOP.

        DATA(tdo_tab) = cl_abap_tabledescr=>get( p_line_type  = cl_abap_structdescr=>get( components )
                                                 p_table_kind = cl_abap_tabledescr=>tablekind_std
                                                 p_key_kind   = cl_abap_tabledescr=>keydefkind_empty ).

        DATA itab TYPE REF TO data.
        CREATE DATA itab TYPE HANDLE tdo_tab.

        "Specifying the pattern for the worksheet selection
        DATA(pattern) = xco_cp_xlsx_selection=>pattern_builder->simple_from_to(
              )->from_column( xco_cp_xlsx=>coordinate->for_alphabetic_value( ui_input-start_column )
              )->from_row( xco_cp_xlsx=>coordinate->for_numeric_value( COND #( WHEN ui_input-no_table_header IS INITIAL THEN ui_input-start_row + 1 ELSE ui_input-start_row ) )
              )->get_pattern( ).

        worksheet->select( pattern
              )->row_stream(
              )->operation->write_to( REF #( itab->* )
              )->execute( ).

        result = itab.
      CATCH cx_root.
        result = REF #( error ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
``` 

 </td>
</tr>

<tr>
<td> 

`ZCL_DEMO_ABAP_ACTION_IMPORT_UI` (global class; no code in other includes)

 </td>

 <td> 


``` abap
CLASS zcl_demo_abap_action_import_ui DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_aia_sd_action_input.
    TYPES:
      "! <p class="shorttext">Make entries for XLSX content retrieval:</p>
      BEGIN OF ty_input,
        "! <p class="shorttext">File Import from Path</p>
        "! $contentMediaType 'application/xlsx'
        "! $contentEncoding 'base64'
        "! $required
        path_text_field  TYPE string,
        worksheet_number TYPE i,
        start_column     TYPE string,
        start_row        TYPE i,
        "! <p class="shorttext">XLSX Content without Table Header Row</p>
        no_table_header  TYPE abap_boolean,
      END OF ty_input.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.



CLASS zcl_demo_abap_action_import_ui IMPLEMENTATION.
  METHOD if_aia_sd_action_input~create_input_config.
    "Default values for input data
    DATA(input_data) = VALUE ty_input( worksheet_number = 1
                                       start_column = `A`
                                       start_row = 1 ).

    "Creating the configuration
    DATA(configuration) = ui_information_factory->get_configuration_factory( )->create_for_data( input_data ).
    "Setting the layout
    configuration->set_layout( if_sd_config_element=>layout-grid ).
    configuration->get_element( 'path_text_field' )->set_file_properties( kind          = if_sd_config_element=>file_properties_kind-path
                                                                          transfer_mode = VALUE #( import = abap_true ) ).

    "Returning the UI information
    result = ui_information_factory->for_abap_type( abap_type     = input_data
                                                    configuration = configuration ).
  ENDMETHOD.
ENDCLASS.
``` 

 </td>
</tr>

<tr>
<td> 

Example XLSX content and demo execution steps

 </td>

 <td> 

**First Example**

- The following table shows content you can use for demonstration purposes.
- You can copy the content of the entire table to the clipboard, go to your worksheet program and paste the content in the first worksheet, first cell, first column. Depending on your program, you may require to pass the clipboard content into the worksheet without any formatting (or with a special pasting option) so that the content is properly inserted line by line.
- Save the XLSX file and proceed with the IDE action execution as described above. 
- On the selection IDE action dialog, just provide the path to the file and leave the other values unchanged. Run the IDE action.


| Carrier ID  | Carrier Name         | Currency | URL                            |
| ----------- | -------------------- | -------- | ------------------------------ |
| AA          | American Airlines    | USD      | http://www.aa.com              |
| AC          | Air Canada           | CAD      | http://www.aircanada.ca        |
| AF          | Air France           | EUR      | http://www.airfrance.fr        |
| BA          | British Airways      | GBP      | http://www.british-airways.com |
| CO          | Continental Airlines | USD      | http://www.continental.com     |
| DL          | Delta Airlines       | USD      | http://www.delta-air.com       |
| LH          | Lufthansa            | EUR      | http://www.lufthansa.com       |
| JL          | Japan Airlines       | JPY      | http://www.jal.co.jp           |
| NW          | Northwest Airlines   | USD      | http://www.nwa.com             |
| QF          | Qantas Airways       | AUD      | http://www.qantas.com.au       |
| SA          | South African Air.   | ZAR      | http://www.saa.co.za           |
| SQ          | Singapore Airlines   | SGD      | http://www.singaporeair.com    |
| SR          | Swiss                | CHF      | http://www.swiss.com           |
| UA          | United Airlines      | USD      | http://www.ual.com             |

**Second Example**

- In the XLSX file having the content from the first example, cut the entire content, and paste it to cell 3 in column 3.
- Save the file and run the IDE action. 
- On the selection IDE action dialog, provide the path to the file and specify these values and run the IDE action:
  - *Start Column*: C  
  - *Start Row*: 3 
  

**Third Example**

- In the XLSX file having the content from the second example, clear the content of the third row, which represents the header line.
- Save the file and run the IDE action. 
- On the selection IDE action dialog, provide the path to the file and specify these values and run the IDE action:
  - *Start Column*: C  
  - *Start Row*: 4
  - Select the *XLSX Content without Table Header Row* checkbox. This will create dummy names (the names of the worksheet columns) for the internal table that is created dynamically.


 </td>
</tr>

</table>

</details>  

</details>  

<p align="right"><a href="#top">⬆️ back to top</a></p>
