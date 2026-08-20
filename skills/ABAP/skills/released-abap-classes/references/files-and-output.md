# ZIP, CSV and PDF output

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- Zip Files
- Writing Internal Table Content to CSV
- Output Management (PDF Rendering)

---

## Zip Files

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_ABAP_ZIP</code> </td>
<td>

The following example creates a zip file and adds three txt files with sample content. Note that the example snippet for `CL_WEB_HTTP_CLIENT_MANAGER` and `CL_HTTP_DESTINATION_PROVIDER` (calling services) also includes the use of `CL_ABAP_ZIP`.

```abap
"Creating a zip file
DATA(zip) = NEW cl_abap_zip( ).

"Adding 3 files to the zip file
DO 3 TIMES.
  DATA(some_content) = |Some text content for file number { sy-index }.|.

  TRY.
      DATA(conv_xstring) = cl_abap_conv_codepage=>create_out( codepage = `UTF-8` )->convert( some_content ).
    CATCH cx_sy_conversion_codepage.
  ENDTRY.

  "Adding xstring as file content to zip
  zip->add( EXPORTING name = |file{ sy-index }.txt|
                      content = conv_xstring ).

ENDDO.

"Saving the zip file
DATA(zipped_file) = zip->save( ).

"Unzipping a zip file
DATA unzipped_content_tab TYPE string_table.

DATA(unzip) = NEW cl_abap_zip( ).
unzip->load( zipped_file ).

LOOP AT unzip->files INTO DATA(file).
  unzip->get( EXPORTING name    = file-name
              IMPORTING content = DATA(unzipped_content)
  ).
  "Converting xstring to string
  TRY.
     DATA(conv_string) = cl_abap_conv_codepage=>create_in( )->convert( unzipped_content ).
    CATCH cx_sy_conversion_codepage.
  ENDTRY.
  APPEND conv_string TO unzipped_content_tab.
ENDLOOP.

*Content of unzipped_content_tab:
*Some text content for file number 1.
*Some text content for file number 2.
*Some text content for file number 3.
```

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Writing Internal Table Content to CSV

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_CSV_FACTORY</code> </td>
<td>

- The <code>CL_CSV_FACTORY</code> class represents a factory class to create CSV writers.
- You can use the `write` method via the created object to write internal table content to CSV.
- Various other methods are available for applying different settings.

<br>

```abap
TYPES: BEGIN OF demo_struct,
          num   TYPE i,
          text  TYPE string,
          chars TYPE c LENGTH 5,
        END OF demo_struct,
        tab_type TYPE TABLE OF demo_struct WITH EMPTY KEY.

DATA(itab) = VALUE tab_type( ( num = 1 text = `abc` chars = 'def' )
                             ( num = 2 text = `ghi` chars = 'jkl' )
                             ( num = 3 text = `mno` chars = 'pqr' )
                             ( num = 4 text = `stu` chars = 'vwx' )
                             ( num = 5 text = `y` chars = 'z' ) ).

DATA(csv_writer) = cl_csv_factory=>new_writer( ).

TRY.
    DATA(csv_xstring) = csv_writer->write( REF #( itab ) ).
    
    DATA(csv) = cl_abap_conv_codepage=>create_in( )->convert( csv_xstring ).
  CATCH cx_csv_writer cx_csv_field_catalog cx_sy_conversion_codepage INTO DATA(err).
    DATA(err_msg) = err->get_text( ).
ENDTRY.
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Output Management (PDF Rendering)

<table>
<tr>
<td> Classes </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_FP_ADS_UTIL</code><br><code>CL_RSPO_PDF_MERGER</code> </td>
<td>

These classes are used in the context of output management. In this context, multiple classes and methods are available. The example code snippet illustrates these:

- `CL_FP_ADS_UTIL`: Offers utility functions for processing forms with Adobe Document Services (ADS), including PDF rendering calls. PDF printing is based on two formats: XDP form template files and XML-formatted data for filling the forms.
- `CL_RSPO_PDF_MERGER`: Provides methods to merge PDF documents

Find more information [here](https://help.sap.com/docs/btp/sap-business-technology-platform/development-output-management).

 <br>

<details>
  <summary>🟢 Click to expand for more information and example code</summary>
  <!-- -->

<br>

Notes on the example:

- You can copy the example into a demo class (e.g., `zcl_demo_abap`) and run it using F9 in ADT. This example illustrates the methods of the two classes mentioned above.
- It provides a basic exploration of class methods and is not meant to serve as a best practice implementation. For detailed information, check the [SAP Help Portal](https://help.sap.com/docs/btp/sap-business-technology-platform/development-output-management).
- The example uses demo XDP and XML files from another SAP samples GitHub repository focused on ADS: [https://github.com/SAP-samples/forms-service-by-adobe-samples](https://github.com/SAP-samples/forms-service-by-adobe-samples). You can find more information there. The code retrieves the code of these files using the `cl_web_http_client_manager` class.
- As a result of the demo, PDF files are sent via email. To enable email sending, refer to the *Sending Emails* section. Additionally, make sure to insert valid email addresses in the code before running the example. Note that the resulting PDF files do not show any detailed content apart from the template skeleton. The focus is on the functionality of the covered classes. 


<br>

```abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES  if_oo_adt_classrun.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_demo_abap IMPLEMENTATION.

  METHOD if_oo_adt_classrun~main.

*&---------------------------------------------------------------------*
*& Getting demo data from an SAP samples GitHub repository
*&---------------------------------------------------------------------*

"NOTE:
"This code is only included to provide a self-contained example with demo
"XDP and XML content for use in the method calls.
"For more information, refer to the SAP Help Portal documentation and
"the GitHub repository (https://github.com/SAP-samples/forms-service-by-adobe-samples).

    TYPES: BEGIN OF s,
             url      TYPE string,
             response TYPE string,
             xstr     TYPE xstring,
           END OF s,
           tabtype TYPE TABLE OF s WITH EMPTY KEY.

    DATA(tab) = VALUE tabtype(
      ( url = `https://raw.githubusercontent.com/SAP-samples/forms-service-by-adobe-samples/refs/heads/main/forms/ZF_CINE_TICKET.xdp` )
      ( url = `https://raw.githubusercontent.com/SAP-samples/forms-service-by-adobe-samples/refs/heads/main/forms/ZCINE_TICKET_SRVD.xsd` ) ).

    "Retrieving the content from the URLs
    LOOP AT tab REFERENCE INTO DATA(wa).
      TRY.
          "Creating a client object using a destination
          "In the example, the HTTP destination is created using a plain URL.          
          DATA(http_client) = cl_web_http_client_manager=>create_by_http_destination( i_destination = cl_http_destination_provider=>create_by_url( i_url = wa->url ) ).
          "Sending an HTTP GET request and returning the response
          "In the example, the HTTP body is retrieved as string data.
          wa->response = http_client->execute( if_web_http_client=>get )->get_text(  ).

          IF wa->response CS `API rate limit exceeded`.
            out->write( `API rate limit exceeded` ).
            RETURN.
          ENDIF.

          IF wa->response IS NOT INITIAL.
            wa->xstr = cl_abap_conv_codepage=>create_out( )->convert( wa->response ).
          ENDIF.

        CATCH cx_root INTO DATA(err).
          out->write( err->get_text( ) ).
          RETURN.
      ENDTRY.
    ENDLOOP.

    IF tab[ 1 ]-xstr IS NOT INITIAL AND tab[ 2 ]-xstr IS NOT INITIAL.
      TRY.
          cl_fp_ads_util=>render_pdf( EXPORTING iv_xml_data      = tab[ 2 ]-xstr
                                                iv_xdp_layout    = tab[ 1 ]-xstr
                                                iv_locale        = 'de_DE'
                                      IMPORTING ev_pdf           = DATA(pdf)
                                                ev_pages         = DATA(pages)
                                                ev_trace_string  = DATA(trace_string) ).

          out->write( pages ).
          out->write( trace_string ).
        CATCH cx_fp_ads_util INTO DATA(render_error).
          out->write( render_error->get_text( ) ).
          RETURN.
      ENDTRY.
    ENDIF.

*&---------------------------------------------------------------------*
*& Merging PDFs
*&---------------------------------------------------------------------*

"Creating an instance of the merger class
    DATA(merger_inst) = cl_rspo_pdf_merger=>create_instance( ).

    "Merging three PDFs
    "In the example, they the same pdf file is added three times.
    merger_inst->add_document( pdf ).
    merger_inst->add_document( pdf ).
    merger_inst->add_document( pdf ).

    TRY.
        "Merging all PDF files into a single PDF file
        DATA(merged_pdf) = merger_inst->merge_documents( ).
      CATCH cx_rspo_pdf_merger INTO DATA(merge_error).
        out->write( merge_error->get_text( ) ).
        RETURN.
    ENDTRY.

*&---------------------------------------------------------------------*
*& Sending pdfs via email
*&---------------------------------------------------------------------*

"NOTE:
"To send emails, administrative tasks have to be performed. Refer to the
"SAP Help Portal documentation and the cheat sheet example.

    TRY.
        "Creating a new mail instance
        DATA(mail) = cl_bcs_mail_message=>create_instance( ).
        "Settings
        mail->set_sender( '...@...' ).
        mail->add_recipient( '...@...' ).
        mail->set_subject( 'Test Mail' ).
        mail->set_main( cl_bcs_mail_textpart=>create_instance(
          iv_content      = `<h3>Test Mail</h3><p>Please find some files attached.<br>Cheers</p>`
          iv_content_type = `text/html` ) ).

        "Creating a zip file containing the created and merged PDF files
        DATA(zip) = NEW cl_abap_zip( ).

        zip->add( EXPORTING name = `test_pdf.pdf`
                            content = pdf ).

        zip->add( EXPORTING name = `merged_pdf.pdf`
                            content = merged_pdf ).

        DATA(zipped_file) = zip->save( ).

        mail->add_attachment( cl_bcs_mail_binarypart=>create_instance(
              iv_content      =  zipped_file
              iv_content_type = 'application/x-zip-compressed'
              iv_filename     = 'zip_file.zip' ) ).

        mail->send( IMPORTING et_status              = DATA(stat)
                              ev_mail_status         = DATA(mail_stat) ).

        out->write( stat ).
        out->write( mail_stat ).
      CATCH cx_bcs_mail INTO DATA(error_mail).
        DATA(error_mail_msg) = error_mail->get_text( ).
        out->write( error_mail_msg ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
``` 

</details>  
</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>
