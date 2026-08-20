# Application jobs

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- Application Jobs

---

## Application Jobs

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_APJ_DT_CREATE_CONTENT</code><br><code>CL_APJ_RT_API</code> </td>
<td>

- `cl_apj_dt_create_content`: Used to create and delete class-based application job catalog entries and templates programmatically.
- `cl_apj_rt_api`: Provides methods to schedule and manage application jobs programmatically.
- A prerequisite for application jobs is a class implementing the `if_apj_rt_run` interface, with its `execute` method run by the background job.
- Find more information [here](https://help.sap.com/docs/btp/sap-business-technology-platform/application-jobs).
- The example, which you can copy into a demo class (e.g. `zcl_demo_abap`) and run using F9 in ADT, covers methods of both classes and explores:
  - Creating an application job catalog entry
  - Creating an application job template
  - Scheduling an application job
  - Getting the application job status
  - Retrieving and canceling application jobs
  - Deleting an application job template
  - Deleting an application job catalog entry

 <br>

<details>
  <summary>🟢 Click to expand for more information and example code</summary>
  <!-- -->

<br>

Notes on the example:

- It rudimentarily explores class methods and is not intended as a best practice implementation. Check the class documentation and the [SAP Help Portal](https://help.sap.com/docs/btp/sap-business-technology-platform/application-jobs) for detailed information.
- It uses a demo database table from the ABAP cheat sheet repository.
- The `execute` method, run by the background job, creates several random entries in a database table to demonstrate the effect of application job runs.
- The example class is self-contained, including the classrun interface so it can be executed, and the implementation of the `if_apj_rt_run` interface. After scheduling the application job, a `WAIT` statement interrupts the program flow. The application job is scheduled to start immediately and run every minute, potentially starting during the wait. The `SELECT` statement following the `WAIT` statement retrieves data from the demo database table into an internal table, possibly including demo data inserted during the job run. If there are no entries, try running the class again and/or change the value of `wait_seconds` constant.
- Due to program interruption, the class run takes time to complete and display output in the console.

The example does not cover several aspects (check the documentation for more information), including:  
- Error handling in the `execute` method  
- Implementing other available interfaces, like `if_apj_dt_defaults`  
- Setting up authorization  
- Using ADT to create job catalog entries and templates

Before running the example class, check the values of the constants in the public section of the class. In particular, ensure you have valid values for these constants:
- `class_name`: Provide the class name where you have copied the code (if it is not `zcl_demo_abap`).
- `transport_request`: Enter a valid transport request.
- `package`: Enter a valid package name.
- Check the *constants related to the example class execution*. Changes to these values affect the program flow.

<br>

```abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    INTERFACES if_apj_rt_run.
    "Public attribute supplied with a value in the job run
    DATA text TYPE c LENGTH 10.

    "---------------------------------------------------------------------
    "Constants related to the catalog
    CONSTANTS catalog_name      TYPE cl_apj_dt_create_content=>ty_catalog_name  VALUE 'ZDEMO_ABAP_JCAT'.
    CONSTANTS catalog_text      TYPE cl_apj_dt_create_content=>ty_text          VALUE 'Demo application job catalog'.
    CONSTANTS class_name        TYPE cl_apj_dt_create_content=>ty_class_name    VALUE 'ZCL_DEMO_ABAP'.
    "Constants related to the template
    CONSTANTS template_name     TYPE cl_apj_dt_create_content=>ty_template_name VALUE 'ZDEMO_ABAP_JTEMPLATE'.
    CONSTANTS template_text     TYPE cl_apj_dt_create_content=>ty_text          VALUE 'Demo application job template'.
    "Constants related to the transport request and package
    CONSTANTS transport_request TYPE cl_apj_dt_create_content=>ty_transport_request VALUE '...'.
    CONSTANTS package           TYPE cl_apj_dt_create_content=>ty_package           VALUE '...'.
    "Constant related to the application job
    CONSTANTS appl_job_text TYPE cl_apj_rt_api=>ty_job_text VALUE 'DEMO_APPL_JOB'.
    "Constants related to the example class execution
    CONSTANTS delete_entries TYPE abap_boolean VALUE abap_false.
    CONSTANTS demo_attribute_value LIKE text VALUE 'TEST'.
    CONSTANTS delete_demo_dbtab_entries TYPE abap_boolean VALUE abap_true.
    "The following constant specifies the duration in seconds the executing class should wait before
    "continuing the processing. Depending on the value, you can expect none or multiple entries in
    "an internal table that is displayed after running the class.
    CONSTANTS wait_seconds TYPE i VALUE
    40
    "80
    "120
    .
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_demo_abap IMPLEMENTATION.

  METHOD if_oo_adt_classrun~main.

    DATA(timestamp) = utclong_current( ).

    IF delete_demo_dbtab_entries = abap_true.
      DELETE FROM zdemo_abap_tabca.
    ENDIF.

*&---------------------------------------------------------------------*
*& Creating an application job catalog entry
*&---------------------------------------------------------------------*

    "Creating an instance to create an application job catalog entry and template
    DATA(jcat) = cl_apj_dt_create_content=>get_instance( ).

    "Checking whether the application job catalog exists
    DATA(jcat_exists) = jcat->exists_job_cat_entry( catalog_name ).

    IF jcat_exists <> 'Y'.
      TRY.
          DATA(jcat_flag) = jcat->create_job_cat_entry(
              iv_catalog_name       = catalog_name
              iv_class_name         = class_name
              iv_text               = catalog_text
              iv_catalog_entry_type = cl_apj_dt_create_content=>class_based
              iv_transport_request  = transport_request
              iv_package            = package ).

          IF jcat_flag = abap_true.
            out->write( |Job catalog entry { catalog_name } creation: Ok!| ).
          ENDIF.
        CATCH cx_apj_dt_content INTO DATA(error_jcat).
          DATA(jcat_error_msg) = error_jcat->get_longtext( ).
          out->write( jcat_error_msg ).
      ENDTRY.
    ELSE.
      out->write( |Job catalog entry { catalog_name } already available.| ).
    ENDIF.

*&---------------------------------------------------------------------*
*& Creating an application job template
*&---------------------------------------------------------------------*

    "Checking whether the application job template exists
    DATA(jtempl_exists) = jcat->exists_job_template_entry( template_name ).

    IF jtempl_exists <> 'Y'.
      TRY.
          DATA(jtempl_flag) =  jcat->create_job_template_entry(
              iv_template_name     = template_name
              iv_catalog_name      = catalog_name
              iv_text              = template_text
              iv_transport_request = transport_request
              iv_package           = package ).

          IF jtempl_flag = abap_true.
            out->write( |Job template { template_name } creation: Ok!| ).
          ENDIF.

        CATCH cx_apj_dt_content INTO DATA(error_jtempl).
          DATA(jtempl_error_msg) = error_jtempl->get_longtext( ).
          out->write( jcat_error_msg ).
      ENDTRY.
    ELSE.
      out->write( |Job template { template_name } already available.| ).
    ENDIF.

*&---------------------------------------------------------------------*
*& Scheduling an application job
*&---------------------------------------------------------------------*

    "Note:
    "- Using the generate_jobkey method, you can create the job key (i.e.
    "  job name and count). The values can be passed to the optional parameters
    "  iv_jobname and iv_jobcount of the schedule_job method. This example does
    "  not use the method. The job key is created when calling the schedule_job
    "  method.
    "- The schedule_job method has numerous mandatory and optional parameters.
    "  Make sure that you check the class documentation for more information.

    GET TIME STAMP FIELD DATA(ts).

    TRY.
        cl_apj_rt_api=>schedule_job(
          EXPORTING
            iv_job_template_name   = template_name
            iv_job_text            = appl_job_text
            "The example specifies the start condition as starting immediately.
            "You can also provide a time stamp.
            is_start_info          = VALUE #( start_immediately = abap_true )

            "Providing information about periodicity
            "The example assigns values to several components of the structure,
            "including the granularity, which is assigned 'MI' (minutes).
            is_scheduling_info     = VALUE #( test_mode = abap_false
                                              periodic_granularity = 'MI'
                                              periodic_value = '1'
                                              timezone = 'UTC' )

            "Providing information about when to end the application job execution
            "The example specifies some components of the structure. Among them is
            "a time stamp that specifies to stop the execution in half an hour.
            is_end_info            = VALUE #( type = 'DATE' "End by
                                              timestamp = cl_abap_tstmp=>move_to_short(
                                                cl_abap_tstmp=>add( tstmp = ts
                                                                    secs  = 1800 ) ) "Half an hour in seconds
                                            )

            "Providing the public attribute of the class with a concrete value
            it_job_parameter_value = VALUE #( ( name = 'TEXT'
                                                t_value = VALUE #( ( sign = 'I' option = 'EQ' low = demo_attribute_value ) ) ) )
          IMPORTING
            ev_jobname             = DATA(jobname)
            ev_jobcount            = DATA(jobcount)
        ).

        out->write( |Job name: "{ jobname }"| ).
        out->write( |Job count: "{ jobcount }"| ).

      CATCH cx_apj_rt INTO DATA(error_jschedule).
        DATA(jschedule_error_msg) = error_jschedule->get_longtext( ).
        out->write( jschedule_error_msg ).
        out->write( `Program execution terminated` ).
        RETURN.
    ENDTRY.

*&---------------------------------------------------------------------*
*& Getting the application job status
*&---------------------------------------------------------------------*

    TRY.
        cl_apj_rt_api=>get_job_status(
          EXPORTING
            iv_jobname         = jobname
            iv_jobcount        = jobcount
          IMPORTING
            ev_job_status      = DATA(jobstatus)
            ev_job_status_text = DATA(jobtext)
        ).

        out->write( |Job status: "{ jobstatus }"| ).
        out->write( |Job text: "{ jobtext }"| ).

      CATCH cx_apj_rt INTO DATA(error_jstatus).
        DATA(jstatus_error_msg) = error_jstatus->get_longtext( ).
        out->write( jstatus_error_msg ).
    ENDTRY.

*&---------------------------------------------------------------------*
*& Evaluating the result of the job run
*&---------------------------------------------------------------------*

    "Note:
    "- The example job run includes the creation of database table entries.
    "- The WAIT statement is used to interrupt the program flow of the
    "  self-contained example class so that the application jobs can run
    "  in the meantime.
    "- Depending on the waiting time, you can expect entries in the internal
    "  table. Otherwise, you may increase the value for the seconds after WAIT
    "  UP TO as the example is designed to run the application job minute-wise.

    WAIT UP TO wait_seconds SECONDS.

    SELECT * FROM zdemo_abap_tabca INTO TABLE @DATA(applj_result).
    out->write( |\n| ).
    out->write( `Application job result` ).
    out->write( |Time stamp when the class was executed: "{ timestamp }"| ).
    out->write( |\n| ).
    IF applj_result IS INITIAL.
      out->write( `No table entries have been created yet. You may want to run the class again.` ).
    ELSE.
      out->write( applj_result ).
    ENDIF.

*&---------------------------------------------------------------------*
*& Retrieving and cancelling aplication jobs
*&---------------------------------------------------------------------*

    "Note:
    "- In the example, application jobs are first retrieved based on the
    "  the specified job catalog. An internal table is returned containing
    "  details of the application jobs, such as the job name and count.
    "- The intenral table is looped across. Using the cancel_job method,
    "  the application jobs are cancelled (if currently running) or deleted.

    TRY.
        DATA(jlist) = cl_apj_rt_api=>find_jobs_with_jce( catalog_name ).

        out->write( |\n| ).
        out->write( `Application job list:` ).
        out->write( jlist ).
      CATCH cx_apj_rt INTO DATA(error_jfind).
        DATA(jfind_error_msg) = error_jfind->get_longtext( ).
        out->write( jfind_error_msg ).
    ENDTRY.

    LOOP AT jlist INTO DATA(j).
      TRY.
          cl_apj_rt_api=>cancel_job(
            EXPORTING
              iv_jobname  = j-jobname
              iv_jobcount = j-jobcount
          ).
        CATCH cx_apj_rt INTO DATA(error_jcancel).
          DATA(jcancel_error_msg)  = error_jcancel->get_longtext( ).
          out->write( jcancel_error_msg ).
      ENDTRY.
    ENDLOOP.

    TRY.
        jlist = cl_apj_rt_api=>find_jobs_with_jce( catalog_name ).

        out->write( |\n| ).

        IF jlist IS INITIAL.
          out->write( `Application jobs for the demo job catalog cancelled.` ).
        ELSE.
          out->write( `Cancel the demo application jobs` ).
        ENDIF.
      CATCH cx_apj_rt INTO error_jfind.
        jfind_error_msg = error_jfind->get_longtext( ).
        out->write( jfind_error_msg ).
    ENDTRY.

*&---------------------------------------------------------------------*
*& Deleting an application job template
*&---------------------------------------------------------------------*

    IF delete_entries = abap_true.
      TRY.
          DATA(jtempl_del_flag) = jcat->delete_job_template_entry(
                                    iv_template_name     = template_name
                                    iv_transport_request = transport_request ).

          IF jtempl_del_flag = abap_true.
            out->write( |Job template { template_name } deletion: Ok!| ).
          ENDIF.
        CATCH cx_apj_dt_content INTO DATA(error_jtempl_del).
          DATA(jtempl_del_error_msg) = error_jtempl_del->get_longtext( ).
          out->write( jtempl_del_error_msg ).          
      ENDTRY.

*&---------------------------------------------------------------------*
*& Deleting an aplication job catalog entry
*&---------------------------------------------------------------------*

      TRY.
          DATA(jcat_del_flag) =  jcat->delete_job_cat_entry(
                                   iv_catalog_name      = catalog_name
                                   iv_transport_request = transport_request ).

          IF jcat_del_flag = abap_true.
            out->write( |Job catalog entry { catalog_name } deletion: Ok!| ).
          ENDIF.

        CATCH cx_apj_dt_content INTO DATA(error_jcat_del).
          DATA(jcat_del_error_msg) = error_jcat_del->get_text( ).
          out->write( jcat_del_error_msg ).          
      ENDTRY.
    ENDIF.

  ENDMETHOD.

  METHOD if_apj_rt_run~execute.
    "Adding sample entries to a demo database table
    DATA itab TYPE TABLE OF zdemo_abap_tabca WITH EMPTY KEY.

    DATA(random_num) = cl_abap_random_int=>create( seed = cl_abap_random=>seed( )
                                              min  = 1
                                              max  = 10000 )->get_next( ).

    DO 3 TIMES.
      APPEND INITIAL LINE TO itab ASSIGNING FIELD-SYMBOL(<line>).
      TRY.
          <line>-id = cl_system_uuid=>create_uuid_x16_static( ).
        CATCH cx_uuid_error.
      ENDTRY.
      <line>-num1 = random_num.
      <line>-num2 = random_num.
      <line>-calc_result = |Attribute value: "{ text }"; timestamp: "{ utclong_current( ) }"|.
    ENDDO.

    MODIFY zdemo_abap_tabca FROM TABLE @itab.
    COMMIT WORK.
  ENDMETHOD.
ENDCLASS.
``` 

</details>  
</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>
